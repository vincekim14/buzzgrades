from sqlalchemy import Column, ForeignKeyConstraint, Integer, PrimaryKeyConstraint, SmallInteger, ForeignKey, VARCHAR, JSON, Float, Table, create_engine, and_
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from mapping.mappings import term_to_name

"""
This file establishes the ORM for SqlAlchemy.

Has definitions for Libeds, Distributions, Class Distributions, Professors, and Department Distributions.
"""


Base = declarative_base()

libedAssociationTable = Table(
    "libedAssociationTable",
    Base.metadata,
    Column("left_id", ForeignKey("libed.id"),primary_key=True),
    Column("right_id", ForeignKey("classdistribution.id"),primary_key=True),
)

class Libed(Base):
    __tablename__ = "libed"
    id = Column(Integer,primary_key=True)
    name = Column(VARCHAR(128),nullable=False,unique=True)
    class_dists = relationship('ClassDistribution',secondary=libedAssociationTable,back_populates="libeds",lazy='selectin')
    def __str__(self) -> str:
        retVal = f"Libed: {self.name}"
        for class_dist in self.class_dists:
            retVal += "\n" + str(class_dist)
        return retVal       
    def __repr__(self) -> str:
        return f"Libed: {self.name}"

class TermDistribution(Base):
    __tablename__ = "termdistribution"
    id = Column(Integer,primary_key=True)
    dist_id = Column(Integer,ForeignKey('distribution.id',ondelete='CASCADE'),nullable=False)
    students = Column(Integer,nullable=False)
    # Term codes are like 202502; must be full Integer to avoid overflow/Blob
    term = Column(Integer,nullable=False)
    grades = Column(JSON,nullable=False)

    def __str__(self) -> str:
        return f"{self.classdist.dept_abbr} {self.classdist.course_num} taught by {self.dist.prof.name} in {term_to_name(self.term)} for {self.students} students with a grade distribution of {self.grades}"
    def __repr__(self) -> str:
        return f"{self.classdist.dept_abbr} {self.classdist.course_num} taught by {self.dist.prof.name} in {term_to_name(self.term)} for {self.students} students with a grade distribution of {self.grades}"


class Distribution(Base):
    __tablename__ = "distribution"
    id = Column(Integer,primary_key=True)
    class_id = Column(Integer,ForeignKey('classdistribution.id',ondelete='CASCADE'),nullable=False)
    instructor_id = Column(Integer,ForeignKey('professor.id',ondelete='CASCADE'),nullable=True)
    # There are ocassionally classes that do not have a professor listed, hence why this is nullable
    # It will be displayed as unlisted professor in class distributions.
    term_dists = relationship('TermDistribution',backref="dist")
    def __str__(self) -> str:
        return f"{self.classdist.dept_abbr} {self.classdist.course_num} taught by {self.prof.name} over {len(self.term_dists)} terms."
    def __repr__(self) -> str:
        return f"{self.classdist.dept_abbr} {self.classdist.course_num} taught by {self.prof.name} over {len(self.term_dists)} terms."
        

class Professor(Base):
    __tablename__ = "professor"
    id = Column(Integer,primary_key=True)
    name = Column(VARCHAR(255),nullable=False)
    RMP_score = Column(Float,nullable=True)
    RMP_diff = Column(Float,nullable=True)
    RMP_would_take_again = Column(Float,nullable=True)
    RMP_link = Column(VARCHAR(512),nullable=True)

    dists = relationship('Distribution',backref="prof")

    def __repr__(self) -> str:
        retVal = f"{self.name} has a RMP of {self.RMP_score} and has the following distributions\n"
        for dist in self.dists:
            retVal += f"{repr(dist)}\n"
        return retVal


class ClassDistribution(Base):
    __tablename__ = "classdistribution"
    id = Column(Integer,primary_key=True)

    campus = Column(VARCHAR(8),nullable=True)
    dept_abbr = Column(VARCHAR(4),nullable=True)
    course_num = Column(VARCHAR(8),nullable=True)

    class_desc = Column(VARCHAR(255),nullable=False)
    total_students = Column(Integer,nullable=False)
    total_grades = Column(JSON,nullable=False)

    dists = relationship('Distribution',backref="classdist")
    libeds = relationship('Libed',secondary=libedAssociationTable,back_populates="class_dists",lazy='selectin')

    __table_args__ = (
        ForeignKeyConstraint(['campus','dept_abbr'], ['departmentdistribution.campus','departmentdistribution.dept_abbr']),
    )

    def __str__(self) -> str:
        return f"{self.dept_abbr} {self.course_num}: {self.total_grades}"

    def __repr__(self) -> str:
        retVal = f"{self.campus} {self.dept_abbr} {self.course_num} ({self.class_desc}) has been taught to {self.total_students} with an overall distribution of {self.total_grades} comprised of the following:\n"
        for dist in self.dists:
            retVal += f"{repr(dist)}\n"
        return retVal

class DepartmentDistribution(Base):
    __tablename__ = "departmentdistribution"
    campus = Column(VARCHAR(8),nullable=True)
    dept_abbr = Column(VARCHAR(4),nullable=False, unique=True)
    
    dept_name = Column(VARCHAR(255),nullable=False)
    class_dists = relationship('ClassDistribution',backref="dept",lazy="selectin")

    __table_args__ = (
        PrimaryKeyConstraint('campus','dept_abbr'),
    )

    def __repr__(self) -> str:
        retVal = f"The department of {self.dept_abbr} - {self.dept_name} has the following distributions:\n"
        for dist in self.class_dists:
            retVal += f"{str(dist)}\n"
        return retVal


class DepartmentSummary(Base):
    __tablename__ = "department_summary"
    dept_abbr = Column(VARCHAR(4), primary_key=True, nullable=False)
    average_gpa = Column(Float, nullable=True)
    most_grade = Column(VARCHAR(2), nullable=True)
    most_percent = Column(Float, nullable=True)

    def __repr__(self) -> str:
        return f"DepartmentSummary(dept_abbr={self.dept_abbr}, avg_gpa={self.average_gpa}, most_grade={self.most_grade}, most_percent={self.most_percent})"


class ClassSummary(Base):
    __tablename__ = "class_summary"
    class_id = Column(Integer, primary_key=True, nullable=False)
    average_gpa = Column(Float, nullable=True)
    most_grade = Column(VARCHAR(2), nullable=True)
    most_percent = Column(Float, nullable=True)

    def __repr__(self) -> str:
        return f"ClassSummary(class_id={self.class_id}, avg_gpa={self.average_gpa}, most_grade={self.most_grade}, most_percent={self.most_percent})"


class InstructorSummary(Base):
    __tablename__ = "instructor_summary"
    instructor_id = Column(Integer, primary_key=True, nullable=False)
    average_gpa = Column(Float, nullable=True)
    most_grade = Column(VARCHAR(2), nullable=True)
    most_percent = Column(Float, nullable=True)

    def __repr__(self) -> str:
        return f"InstructorSummary(instructor_id={self.instructor_id}, avg_gpa={self.average_gpa}, most_grade={self.most_grade}, most_percent={self.most_percent})"


engine = create_engine("sqlite:///./ProcessedData.db",echo=False,future=True)

if __name__ == "__main__":
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

Session = sessionmaker(bind=engine, autoflush=False)
