import pandas as pd
from db.Models import Session, ClassDistribution, DepartmentDistribution, Professor, Distribution, Libed, TermDistribution, and_
from collections import Counter
from mapping.mappings import term_to_name, dept_mapping, libed_mapping

class Process:
    @staticmethod
    def process_dist(x: pd.DataFrame) -> pd.DataFrame:
        """
        Grouped element by instructor, term_code, subject, and course_number, generating a distribution with the appropriate class distribution and professor.
        If the class distribution or professor or department doesn't exist, it will create them.
        If it already exists, will update and overwrite with new data.
        """
        session = Session()
        
        # Validate required columns for security and data integrity
        required_columns = ["instructor", "subject", "course_number", "term_code"]
        missing_columns = [col for col in required_columns if col not in x.columns]
        if missing_columns:
            raise ValueError(f"Invalid data format: missing required columns {missing_columns}. Expected data format with columns: {required_columns}")
        
        prof_name = x["instructor"].iloc[0]
        dept_abbr = x["subject"].iloc[0]
        catalog_num = x["course_number"].iloc[0]
        class_descr = f"{dept_abbr} {catalog_num}"
        term = int(x["term_code"].iloc[0])
        campus = "MAIN"  # Only one ATL campus for now (consider addding more if study abroad campuses become a request)
        
        grade_hash = {
            'A': 0,
            'B': 0,
            'C': 0, 
            'D': 0,
            'F': 0,
            'S': 0,
            'U': 0,
            'V': 0,
            'I': 0,
            'W': 0
        }
        
        # Initialize grade counts from all sections combined
        try:
            # Sum across all rows in the groupWed data to combine sections
            grade_columns = {
                'A': 'hc_A',
                'B': 'hc_B',
                'C': 'hc_C',
                'D': 'hc_D',
                'F': 'hc_F',
                'S': 'hc_S',
                'U': 'hc_U',
                'V': 'hc_V',
                'I': 'hc_I',
                'W': 'hc_W',
            }
            
            for grade, col in grade_columns.items():
                if col in x.columns:
                    # Sum the headcounts for this grade across all sections as integers
                    total = x[col].apply(pd.to_numeric, errors='coerce').fillna(0).sum()
                    grade_hash[grade] = int(round(total))
        except Exception as e:
            print(f"Warning: Error processing grade data: {e}")
            # Keep default grade_hash values (all zeros)
        
        # Calculate total students from the sum of all grade counts
        num_students = int(sum(int(v) for v in grade_hash.values() if not pd.isna(v)))
        
        # Begin Insertion
        class_dist = session.query(ClassDistribution).filter(and_(ClassDistribution.dept_abbr == dept_abbr, ClassDistribution.course_num == catalog_num, ClassDistribution.campus == campus)).first()
        dept = session.query(DepartmentDistribution).filter(and_(DepartmentDistribution.dept_abbr == dept_abbr, DepartmentDistribution.campus == campus)).first()
        prof = session.query(Professor).filter(Professor.name == prof_name).first() or session.query(Professor).filter(Professor.name == "Unknown Instructor").first()
        
        if class_dist == None:
            class_dist = ClassDistribution(campus=campus, dept_abbr=dept_abbr, course_num=catalog_num, class_desc=class_descr, total_students=num_students, total_grades=grade_hash)
            session.add(class_dist)
            session.flush()
            print(f"[DIST Create] Created New Class Distribution {class_dist.dept_abbr} {class_dist.course_num}")
        else:
            class_dist.total_grades = Counter(class_dist.total_grades) + Counter(grade_hash)
            class_dist.total_students += num_students
            print(f"[DIST Update] Updated Class Distribution {class_dist.dept_abbr} {class_dist.course_num}")

        dist = session.query(Distribution).filter(
            Distribution.class_id == class_dist.id,
            Distribution.professor_id == prof.id
        ).first()

        if dist is None:
            dist = Distribution(class_id=class_dist.id, professor_id=prof.id)
            session.add(dist)
            session.flush()
            print(f"[DIST Create] Created New Distribution {prof_name}:{class_dist.dept_abbr} {class_dist.course_num}")
        else:
            print(f"[DIST Update] Using Existing Distribution {prof_name}:{class_dist.dept_abbr} {class_dist.course_num}")

        # Upsert the per-term distribution for this distribution
        term_dist = session.query(TermDistribution).filter(
            TermDistribution.term == term,
            TermDistribution.dist_id == dist.id
        ).first()

        if term_dist is None:
            term_dist = TermDistribution(
                term=term,
                dist_id=dist.id,
                students=num_students,
                grades=grade_hash,
            )
            session.add(term_dist)
            print(f"[TERM Create] Created New Term Distribution for {term_to_name(term)}")
        else:
            term_dist.grades = Counter(term_dist.grades) + Counter(grade_hash)
            term_dist.students += num_students
            print(f"[TERM Update] Updated Term Distribution for {term_to_name(term)}")

        session.commit()
        session.close()
        return x

    @staticmethod
    def process_prof(prof_name: str) -> None:
        """
        Process a professor, generating them in the DB if they do not exist.
        """
        session = Session()
        prof = session.query(Professor).filter(Professor.name == prof_name).first()
        if prof == None:
            prof = Professor(name=prof_name)
            session.add(prof)
            session.commit()
            print(f"[PROF Create] Added {prof_name} to Professors")
        session.close()

    @staticmethod
    def process_dept(dept_tuple: tuple[str, str]) -> None:
        # Process a department, generating in DB if they do not exist. If department isn't in dept_mapping, it will be created with its abbreviation as the name.
        campus, dept_abbr = dept_tuple
        if campus not in dept_mapping:
            print(f"[WARNING] Campus {campus} not found in dept_mapping, using campus code as name")
            # Create a new campus entry if it doesn't exist
            dept_mapping[campus] = {}
        
        if dept_abbr not in dept_mapping[campus]:
            print(f"[WARNING] Department {dept_abbr} not found in dept_mapping for campus {campus}, using abbreviation as name")
            # Use the department abbreviation as the department name if not in mapping
            dept_mapping[campus][dept_abbr] = dept_abbr

        session = Session()
        dept = session.query(DepartmentDistribution).filter(and_(DepartmentDistribution.campus == campus, DepartmentDistribution.dept_abbr == dept_abbr)).first()

        if dept == None:
            dept = DepartmentDistribution(
                campus=campus,
                dept_abbr=dept_abbr,
                dept_name=dept_mapping[campus][dept_abbr]
            )
            session.add(dept)
            session.commit()
            print(f"[DEPT Create] Added {dept_abbr} to Departments")
        session.close()

    @staticmethod
    def process_libeds() -> None:
        """
        Process all libeds, generating them in the DB if they do not exist.
        """
        session = Session()
        for key, value in libed_mapping.items():
            libed = session.query(Libed).filter(Libed.name == value).first()
            if libed == None:
                libed = Libed(name=value, abbr=key)
                session.add(libed)
                print(f"[LIBED Create] Added {key} to Libeds")
        session.commit()
        session.close()