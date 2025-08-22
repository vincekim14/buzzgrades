import argparse
import pandas as pd
import numpy as np
import os
from db.Models import Session, Professor, DepartmentDistribution, TermDistribution
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
# Import data preprocessor for CSV file preprocessing
from data_preprocessor import process_csv_file as clean_csv_file

from src.generation.process import Process
from src.rmp.rmp import RMP

# This script is specifically for Georgia Tech data processing
# Process Spring 2025 and Summer 2025 cleaned data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Run Georgia Tech Data Generation!')
    # parser.add_argument("--spring", action='store_true', help="Process Spring 2025 data")
    # parser.add_argument("--summer", action='store_true', help="Process Summer 2025 data") 
    parser.add_argument('-dr','--disableRMP', dest='DisableRMP', action='store_true', help='Disables RMP Search.')
    parser.add_argument('--rmp-only', action='store_true', help='Run only RMP processing (skip CSV data processing).')
    parser.add_argument('--clean-professors', action='store_true', help='Clean professor names and merge duplicates during RMP processing.')
    parser.add_argument('--overwrite', action='store_true', help='Overwrite existing term data in the database instead of appending it.')
    parser.add_argument('--cleardb', action='store_true', help='Clear the entire database content before importing new data.')
    parser.add_argument('--process-all', action='store_true', help='Process all CSV files in GRADE_DATA directory.')

    args = parser.parse_args()
    
    # Use the main database used by the frontend; do not delete existing data
    from db.Models import Base
    gt_engine = create_engine("sqlite:///./ProcessedData.db", echo=False, future=True)

    # Import all model classes for reference
    from db.Models import Libed, TermDistribution, Distribution, Professor, ClassDistribution, DepartmentDistribution

    # Define a custom Session class for GT data
    GTSession = sessionmaker(bind=gt_engine, autoflush=False)

    # Create tables using the imported Base with all models
    Base.metadata.create_all(gt_engine)
    
    # Override the Session
    import db.Models
    db.Models.Session = GTSession
    
    # Create a fresh session for initialization
    session = GTSession()
    
    # If overwrite is specified, clear the relevant tables for the terms being processed or clear entire database
    if args.overwrite:
        print("[WARNING] Overwrite mode enabled.")
        if args.cleardb:
            # Clear all data from the main tables
            print("[DANGER] Clearing entire database content...")
            try:
                # We need to delete in the correct order due to foreign key constraints
                from sqlalchemy import text
                session.execute(text("DELETE FROM termdistribution"))
                session.execute(text("DELETE FROM distribution"))
                session.execute(text("DELETE FROM classdistribution"))
                session.execute(text("DELETE FROM departmentdistribution"))
                session.execute(text("DELETE FROM professor"))
                session.commit()
                print("[MAIN] Successfully cleared all database content.")
            except Exception as e:
                print(f"[ERROR] Failed to clear database: {str(e)}")
                session.rollback()
        else:
            # Collect term codes to delete from CSV files
            print("[WARNING] Deleting existing term data for CSV files being processed.")
            term_codes_to_delete = []
            
            # Scan all CSV files in GRADE_DATA directory to find term codes
            class_data_dir = "GRADE_DATA"
            if args.process_all and os.path.exists(class_data_dir) and os.path.isdir(class_data_dir):
                csv_files = [os.path.join(class_data_dir, f) for f in os.listdir(class_data_dir) if f.endswith('.csv')]
                
                for csv_file in csv_files:
                    try:
                        df_sample = pd.read_csv(csv_file, nrows=1)
                        term_col = None
                        
                        # Check for term column in different formats
                        if 'Term' in df_sample.columns:
                            term_col = 'Term'
                        elif 'term_code' in df_sample.columns:
                            term_col = 'term_code'
                        
                        if term_col and not df_sample[term_col].empty:
                            term_value = df_sample[term_col].iloc[0]
                            if isinstance(term_value, str) and term_value.isdigit():
                                term_codes_to_delete.append(int(term_value))
                            elif isinstance(term_value, (int, float)):
                                term_codes_to_delete.append(int(term_value))
                            print(f"[INFO] Found term code {int(term_value)} in file {os.path.basename(csv_file)}")
                    except Exception as e:
                        print(f"[WARNING] Could not determine term code from {csv_file}: {str(e)}")
                        
            # If term codes were found, delete related data from the database
            if term_codes_to_delete:
                term_codes_to_delete = list(set(term_codes_to_delete))  # Remove duplicates
                print(f"[MAIN] Found term codes to delete: {term_codes_to_delete}")
                
                for term_code in term_codes_to_delete:
                    print(f"[MAIN] Clearing data for term {term_code}...")
                    try:
                        # Find all TermDistribution entries for this term
                        term_dists = session.query(TermDistribution).filter(TermDistribution.term == term_code).all()
                        
                        for term_dist in term_dists:
                            # Delete the TermDistribution entry
                            session.delete(term_dist)
                        
                        session.commit()
                        print(f"[MAIN] Successfully cleared term data for: {term_code}")
                    except Exception as e:
                        print(f"[ERROR] Failed to clear term {term_code}: {str(e)}")
                        session.rollback()
    
    session.close()
    
    # Function to process a CSV file
    def process_csv_file(file_path, force_process=False):
        try:
            if not os.path.exists(file_path):
                print(f"[WARNING] File {file_path} does not exist. Skipping.")
                return
            
            # Step 1: Clean the CSV file (process instructor names and calculate headcounts)
            print(f"[MAIN] Cleaning data in {file_path}")
            clean_csv_file(file_path)
            print(f"[MAIN] Finished cleaning {file_path}")
                
            print(f"[MAIN] Loading data from {file_path}")
            
            df = pd.read_csv(file_path, dtype={"section": str, "Section": str})
            
            # Rename columns to the expected internal names
            column_mapping = {
                'Term': 'term_code',
                'Course': 'course_full',
                'Instructor': 'instructor',
                'Section': 'section',
                'Enrollment': 'enrollment',
                'Average': 'avg_gpa'
            }
            
            # Rename the columns instead of creating duplicates
            df.rename(columns=column_mapping, inplace=True, errors='ignore')
            
            # Always parse subject and course_number from Course column
            if 'Course' in df.columns or 'course_full' in df.columns:
                # Use either Course or course_full column
                course_col = 'Course' if 'Course' in df.columns else 'course_full'
                # Parse subject and course_number from Course (e.g., "ACCT 2101" -> subject="ACCT", course_number="2101")
                df['subject'] = df[course_col].str.extract(r'^([A-Za-z]+)', expand=False)
                df['course_number'] = df[course_col].str.extract(r'[A-Za-z]+\s+(.+)', expand=False)
            
            # Exclude courses whose course_number ends with 'R' (e.g., 2110R)
            df = df[~df["course_number"].astype(str).str.endswith('R', na=False)]
            print(f"[MAIN] Loaded Data from {file_path}")
            print(f"[DEBUG] Columns in data: {df.columns.tolist()}")
            
            # Process instructors
            print("[MAIN] Adding Instructors")
            # Add All Instructors Including an "Unknown Instructor" for non-attributed values to the Database
            session = Session()
            prof_list = np.array([prof.name for prof in session.query(Professor).all()])
            session.close()
            data_list = df["instructor"].unique() if "instructor" in df.columns else []
            diff_list = np.setdiff1d(data_list, prof_list)
            
            if diff_list.size > 0:
                print(f"[MAIN] Adding {len(diff_list)} new instructors")
                for x in diff_list:
                    if x and not pd.isna(x):
                        print(f"[DEBUG] Adding instructor: {x}")
                        Process.process_prof(x)
            else:
                print("[MAIN] No new instructors found.")
                
            # Add unknown instructor
            Process.process_prof("Unknown Instructor")

            session = Session()
            if session.query(Professor).filter(Professor.name == "Unknown Instructor").first() == None:
                session.add(Professor(name="Unknown Instructor"))
                session.commit()
                print("[MAIN] Added 'Unknown Instructor' to Instructors.")
            session.close()
            
            print("[MAIN] Finished Instructor Insertion")
            
            # Process departments
            print("[MAIN] Adding Departments")
            unique_subjects = df["subject"].unique()
            print(f"[DEBUG] Found subjects in data: {unique_subjects}")
            
            for subject in unique_subjects:
                if subject and not pd.isna(subject):
                    dept_tuple = ('MAIN', subject)
                    print(f"[DEBUG] Adding department: {dept_tuple}")
                    try:
                        Process.process_dept(dept_tuple)
                    except ValueError as e:
                        print(f"[ERROR] Failed to process department {dept_tuple}: {str(e)}")
            
            print("[MAIN] Finished Department Insertion")
            
            # Generate distributions
            print("[MAIN] Generating Distributions")
            session = Session()
            # If force_process is True, we process all rows, otherwise we only process new terms
            if force_process:
                new_additions = df
            else:
                new_additions = df[~df["term_code"].isin(list(set(TermDist.term for TermDist in session.query(TermDistribution).all())))]
            session.close()
            
            if not new_additions.empty:
                # Group by term, instructor, course (without section) for aggregation
                # This ensures that all sections taught by the same instructor for the same course are combined
                # Use the correct column names for groupby
                new_additions.groupby(["term_code", "instructor", "subject", "course_number"], group_keys=False).apply(Process.process_dist)
                print(f"[MAIN] Finished Generating Distributions for {len(new_additions)} rows")
            else:
                print("[MAIN] No new data to process")
                
            return True
            
        except Exception as e:
            print(f"[ERROR] Failed to process file {file_path}: {str(e)}")
            return False
    
    # Handle RMP-only mode
    if args.rmp_only:
        print("[MAIN] RMP-only mode: Skipping CSV processing, running RMP updates only")
        
        # Initialize database connection
        from db.Models import Base
        gt_engine = create_engine("sqlite:///./ProcessedData.db", echo=False, future=True)
        
        # Override the Session
        import db.Models
        db.Models.Session = sessionmaker(bind=gt_engine, autoflush=False)
        
        # Run RMP processing with options
        clean_names = args.clean_professors if hasattr(args, 'clean_professors') else True
        
        print("[MAIN] Starting RMP processing...")
        RMP().update_profs(clean_names=clean_names, fix_duplicates=clean_names)
        print("[MAIN] RMP processing completed")
        
        # Exit after RMP processing
        exit(0)
    
    # Set process_all to True if no specific file options are given
    args.process_all = True

    # Process all CSV files in GRADE_DATA directory if specified
    if args.process_all:
        class_data_dir = "GRADE_DATA"
        if os.path.exists(class_data_dir) and os.path.isdir(class_data_dir):
            csv_files = [os.path.join(class_data_dir, f) for f in os.listdir(class_data_dir) if f.endswith('.csv')]
            
            if not csv_files:
                print(f"[MAIN] No CSV files found in {class_data_dir}")
            else:
                print(f"[MAIN] Found {len(csv_files)} CSV files to process in {class_data_dir}")
                
                # Process libeds only once
                print("[MAIN] Defining Libeds")
                Process.process_libeds()
                print("[MAIN] Libeds Defined")
                
                # Process each CSV file
                for csv_file in sorted(csv_files):
                    print(f"\n[MAIN] Processing {os.path.basename(csv_file)}")
                    process_csv_file(csv_file, force_process=args.overwrite)
        else:
            print(f"[ERROR] Directory {class_data_dir} does not exist or is not a directory")
    
    # Optional enhancements
    if not args.DisableRMP:
        print("[MAIN] RMP Update For Instructors")
        RMP().update_profs()
        print("[MAIN] RMP Updated")