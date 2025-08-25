#!/usr/bin/env python3
"""
Generate summary tables for departments, classes, and instructors.

This script calculates averageGPA, mostStudents (most common grade), and mostStudentsPercent
using the same logic as the frontend's calculateAggregateStats function.
These precomputed summaries will be joined in FTS search queries for instant tag rendering.
"""

import json
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from db.Models import (
    Base, ClassDistribution, Professor, DepartmentDistribution, 
    DepartmentSummary, ClassSummary, InstructorSummary,
    Distribution, TermDistribution
)


# GPA mapping for GT letter grades (matches frontend/lib/db/utils.js)
GPA_MAP = {
    'A': 4.0,
    'B': 3.0,
    'C': 2.0,
    'D': 1.0,
    'F': 0.0,
}


def calculate_aggregate_stats(all_grades):
    """
    Calculate aggregate statistics from grades using the same logic as frontend.
    Matches calculateAggregateStats function in frontend/lib/db/utils.js exactly.
    
    Args:
        all_grades: List of grade distribution objects (dicts with grade->count)
    
    Returns:
        dict with averageGPA, mostStudents, mostStudentsPercent
    """
    if not all_grades or not isinstance(all_grades, list):
        return {'averageGPA': 0, 'mostStudents': '', 'mostStudentsPercent': 0}

    combined_grades = {}
    total_students = 0

    # Process each grade distribution
    for grade_data in all_grades:
        if grade_data and isinstance(grade_data, dict):
            for grade, count in grade_data.items():
                if isinstance(count, (int, float)) and count > 0:
                    combined_grades[grade] = combined_grades.get(grade, 0) + count
                    total_students += count

    if total_students == 0:
        return {'averageGPA': 0, 'mostStudents': '', 'mostStudentsPercent': 0}

    # Calculate average GPA (only GT letter grades: A,B,C,D,F)
    impacting_grades = [(grade, count) for grade, count in combined_grades.items() 
                       if grade in GPA_MAP]
    
    total_impacting_students = sum(count for _, count in impacting_grades)
    
    average_gpa = 0.0
    if total_impacting_students > 0:
        weighted_sum = sum(GPA_MAP[grade] * count for grade, count in impacting_grades)
        average_gpa = round(weighted_sum / total_impacting_students, 2)

    # Find most common grade
    if not combined_grades:
        most_students = ''
        most_students_percent = 0
    else:
        most_grade, most_count = max(combined_grades.items(), key=lambda x: x[1])
        most_students = most_grade
        most_students_percent = round((100 * most_count) / total_students, 1)

    return {
        'averageGPA': average_gpa,
        'mostStudents': most_students,
        'mostStudentsPercent': most_students_percent,
    }


def generate_class_summaries(session):
    """Generate summaries for all classes."""
    print("Generating class summaries...")
    
    # Clear existing summaries
    session.query(ClassSummary).delete()
    
    # Get all classes with their grade distributions
    classes = session.query(ClassDistribution).all()
    
    summaries = []
    for class_dist in classes:
        # Collect all grade distributions for this class
        all_grades = []
        
        # Add total_grades if it exists
        if class_dist.total_grades:
            try:
                if isinstance(class_dist.total_grades, str):
                    total_grades = json.loads(class_dist.total_grades)
                else:
                    total_grades = class_dist.total_grades
                all_grades.append(total_grades)
            except (json.JSONDecodeError, TypeError):
                pass
        
        # Add individual distribution grades
        for dist in class_dist.dists:
            for term_dist in dist.term_dists:
                if term_dist.grades:
                    try:
                        if isinstance(term_dist.grades, str):
                            grades = json.loads(term_dist.grades)
                        else:
                            grades = term_dist.grades
                        all_grades.append(grades)
                    except (json.JSONDecodeError, TypeError):
                        pass
        
        # Calculate summary
        stats = calculate_aggregate_stats(all_grades)
        
        summary = ClassSummary(
            class_id=class_dist.id,
            average_gpa=stats['averageGPA'] if stats['averageGPA'] > 0 else None,
            most_grade=stats['mostStudents'] if stats['mostStudents'] else None,
            most_percent=stats['mostStudentsPercent'] if stats['mostStudentsPercent'] > 0 else None
        )
        summaries.append(summary)
    
    session.add_all(summaries)
    print(f"Generated {len(summaries)} class summaries")


def generate_instructor_summaries(session):
    """Generate summaries for all instructors."""
    print("Generating instructor summaries...")
    
    # Clear existing summaries
    session.query(InstructorSummary).delete()
    
    # Get all professors with their distributions
    professors = session.query(Professor).all()
    
    summaries = []
    for prof in professors:
        # Collect all grade distributions taught by this professor
        all_grades = []
        
        for dist in prof.dists:
            for term_dist in dist.term_dists:
                if term_dist.grades:
                    try:
                        if isinstance(term_dist.grades, str):
                            grades = json.loads(term_dist.grades)
                        else:
                            grades = term_dist.grades
                        all_grades.append(grades)
                    except (json.JSONDecodeError, TypeError):
                        pass
        
        # Calculate summary
        stats = calculate_aggregate_stats(all_grades)
        
        summary = InstructorSummary(
            instructor_id=prof.id,
            average_gpa=stats['averageGPA'] if stats['averageGPA'] > 0 else None,
            most_grade=stats['mostStudents'] if stats['mostStudents'] else None,
            most_percent=stats['mostStudentsPercent'] if stats['mostStudentsPercent'] > 0 else None
        )
        summaries.append(summary)
    
    session.add_all(summaries)
    print(f"Generated {len(summaries)} instructor summaries")


def generate_department_summaries(session):
    """Generate summaries for all departments."""
    print("Generating department summaries...")
    
    # Clear existing summaries
    session.query(DepartmentSummary).delete()
    
    # Get all departments with their class distributions
    departments = session.query(DepartmentDistribution).all()
    
    summaries = []
    for dept in departments:
        # Collect all grade distributions for classes in this department
        all_grades = []
        
        for class_dist in dept.class_dists:
            # Add total_grades if it exists
            if class_dist.total_grades:
                try:
                    if isinstance(class_dist.total_grades, str):
                        total_grades = json.loads(class_dist.total_grades)
                    else:
                        total_grades = class_dist.total_grades
                    all_grades.append(total_grades)
                except (json.JSONDecodeError, TypeError):
                    pass
            
            # Add individual distribution grades
            for dist in class_dist.dists:
                for term_dist in dist.term_dists:
                    if term_dist.grades:
                        try:
                            if isinstance(term_dist.grades, str):
                                grades = json.loads(term_dist.grades)
                            else:
                                grades = term_dist.grades
                            all_grades.append(grades)
                        except (json.JSONDecodeError, TypeError):
                            pass
        
        # Calculate summary
        stats = calculate_aggregate_stats(all_grades)
        
        summary = DepartmentSummary(
            dept_abbr=dept.dept_abbr,
            average_gpa=stats['averageGPA'] if stats['averageGPA'] > 0 else None,
            most_grade=stats['mostStudents'] if stats['mostStudents'] else None,
            most_percent=stats['mostStudentsPercent'] if stats['mostStudentsPercent'] > 0 else None
        )
        summaries.append(summary)
    
    session.add_all(summaries)
    print(f"Generated {len(summaries)} department summaries")


def main():
    """Main function to generate all summary tables."""
    engine = create_engine("sqlite:///./ProcessedData.db", echo=False, future=True)
    
    # Create tables if they don't exist
    Base.metadata.create_all(engine)
    
    Session = sessionmaker(bind=engine, autoflush=False)
    session = Session()
    
    try:
        print("Starting summary generation...")
        
        # Generate summaries for each entity type
        generate_class_summaries(session)
        generate_instructor_summaries(session)
        generate_department_summaries(session)
        
        # Commit all changes
        session.commit()
        print("Summary generation completed successfully!")
        
    except Exception as e:
        session.rollback()
        print(f"Error during summary generation: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()