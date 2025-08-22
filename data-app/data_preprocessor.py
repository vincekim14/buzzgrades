#!/usr/bin/env python3
"""
Data Preprocessor for Grade Distribution CSV Files

This module provides comprehensive preprocessing functionality for grade distribution CSV files.
It handles:
- Instructor name standardization (converting "Last, First" to "First Last" format)
- Grade distribution percentage cleaning (removing % symbols)
- Headcount calculation from enrollment and grade percentages
- Column name standardization and duplicate removal
- CSV file processing and validation

Main entry point: process_csv_file() for individual file processing
                 main() for batch processing all CSV files in GRADE_DATA directory
"""
import pandas as pd
import os
import glob
import numpy as np
import re
from pathlib import Path

def clean_instructor_name(name):
    """
    Convert instructor name from "Last, First" to "First Last" format.
    Handles cases with or without quotes.
    """
    if pd.isna(name) or name == '':
        return name
    
    # Remove quotes if present
    name = name.strip('"\'')
    
    # Check if the name has a comma indicating "Last, First" format
    if ',' in name:
        parts = name.split(',', 1)
        last_name = parts[0].strip()
        first_name = parts[1].strip()
        return f"{first_name} {last_name}"
    
    # If no comma, leave as is
    return name

def calculate_headcounts(row):
    """
    Calculate headcount values for each grade distribution column.
    Returns a dictionary with the headcount values.
    """
    # Get the enrollment value and convert to integer if it's a string
    enrollment_val = row.get('Enrollment', row.get('enrollment', 0))
    if isinstance(enrollment_val, str):
        try:
            enrollment_val = int(enrollment_val)
        except ValueError:
            # Handle case where Enrollment might not be a valid integer
            enrollment_val = 0
    
    if pd.isna(enrollment_val) or enrollment_val == 0:
        return {}
    
    headcounts = {}
    
    # Process each distribution column
    for grade in ['A', 'B', 'C', 'D', 'F', 'S', 'U', 'V', 'I', 'W', 'IJ']:
        # Check if the grade column exists directly in the row (new format)
        # or with dist_ prefix (old format)
        value = None
        if grade in row and not pd.isna(row[grade]):
            # New format: direct column name (e.g., 'A' instead of 'dist_A')
            value = row[grade]
        elif f'dist_{grade}' in row and not pd.isna(row[f'dist_{grade}']):
            # Old format: with dist_ prefix
            value = row[f'dist_{grade}']
        
        hc_col = f'hc_{grade}'
        
        if value is not None:
            # Handle percentage format: strip the '%' symbol if present
            if isinstance(value, str) and '%' in value:
                value = float(value.strip('%'))
            # Calculate headcount: percentage * enrollment, rounded to nearest integer
            headcounts[hc_col] = round(float(value) * enrollment_val / 100)
        else:
            # If the distribution column doesn't exist or is empty, set headcount to 0
            headcounts[hc_col] = 0
    
    return headcounts

def process_csv_file(file_path):
    """
    Process a single CSV file:
    1. Read the CSV file
    2. Clean instructor names
    3. Remove percentage signs from grade columns
    4. Calculate headcounts based on Enrollment
    5. Keep only necessary columns
    6. Write back to the file
    """
    print(f"Processing {file_path}...")
    
    try:
        # Read the CSV file
        df = pd.read_csv(file_path)
        
        # Clean instructor names - directly modify the existing Instructor column
        if 'Instructor' in df.columns:
            df['Instructor'] = df['Instructor'].apply(clean_instructor_name)
        elif 'instructor' in df.columns:
            df['Instructor'] = df['instructor'].apply(clean_instructor_name)
            df.drop(columns=['instructor'], inplace=True, errors='ignore')
        
        # Convert Enrollment to numeric if needed
        if 'Enrollment' in df.columns:
            if df['Enrollment'].dtype == 'object':
                df['Enrollment'] = pd.to_numeric(df['Enrollment'], errors='coerce')
        elif 'enrollment' in df.columns:
            if df['enrollment'].dtype == 'object':
                df['enrollment'] = pd.to_numeric(df['enrollment'], errors='coerce')
        
        # Remove percentage signs from grade columns and convert to float values
        grade_cols = ['A', 'B', 'C', 'D', 'F', 'S', 'U', 'V', 'I', 'W', 'IJ']
        
        # Process each grade column in both new and old formats
        for grade in grade_cols:
            # New format: direct column names
            if grade in df.columns:
                df[grade] = df[grade].apply(lambda x: float(str(x).replace('%', '')) if pd.notna(x) else x)
            # Old format: with dist_ prefix
            if f'dist_{grade}' in df.columns:
                df[f'dist_{grade}'] = df[f'dist_{grade}'].apply(lambda x: float(str(x).replace('%', '')) if pd.notna(x) else x)
        
        # Calculate headcounts
        headcount_data = df.apply(calculate_headcounts, axis=1)
        
        # Merge the calculated headcounts into the dataframe
        for i, hc in enumerate(headcount_data):
            for col, val in hc.items():
                df.at[i, col] = val
        
        # Remove duplicate columns - keep only the capitalized versions
        duplicates_to_remove = [
            ('term_code', 'Term'),
            ('course_full', 'Course'),
            ('section', 'Section'),
            ('enrollment', 'Enrollment'),
            ('avg_gpa', 'Average'),
            ('instructor', 'Instructor')
        ]
        
        for lowercase_col, uppercase_col in duplicates_to_remove:
            # If both exist, keep the uppercase one
            if lowercase_col in df.columns:
                if uppercase_col not in df.columns:
                    df[uppercase_col] = df[lowercase_col]
                df.drop(columns=[lowercase_col], inplace=True, errors='ignore')
        
        # Remove subject and course_number columns if they exist
        columns_to_remove = ['subject', 'course_number']
        df.drop(columns=columns_to_remove, inplace=True, errors='ignore')
        
        # Save the processed file back to the same location
        df.to_csv(file_path, index=False)
        print(f"Successfully processed {file_path}")
        
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")

def main():
    """
    Main function to process all CSV files in the GRADE_DATA directory.
    """
    # Get the base directory
    base_dir = Path(__file__).parent
    class_data_dir = base_dir / 'GRADE_DATA'
    
    # Find all CSV files in the GRADE_DATA directory
    # Look for both cleaned files and new format files (without 'cleaned' in the name)
    csv_files = list(class_data_dir.glob('*.csv'))
    
    print(f"Found {len(csv_files)} CSV files to process")
    
    # Process each file
    for file_path in csv_files:
        process_csv_file(str(file_path))

if __name__ == "__main__":
    main()