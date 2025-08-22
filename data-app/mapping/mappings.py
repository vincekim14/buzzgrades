"""
Mappings for term codes, grades, and other data.
"""

# Georgia Tech uses the following term codes:
# Last two digits of year + term code
# Spring: 02
# Summer: 05
# Fall: 08
#
# For example:
# Spring 2025: 202502
# Summer 2025: 202505
# Fall 2025: 202508

def term_to_name(term: int):
    # Converts a number to term name (e.g. 202502 -> "Spring 2025")
    term_str = str(term)
    if len(term_str) != 6:
        return "Invalid Term"
    
    year = term_str[0:4]
    term_code = term_str[4:6]
    
    if term_code == "02":
        return f"Spring {year}"
    elif term_code == "05":
        return f"Summer {year}"
    elif term_code == "08":
        return f"Fall {year}"
    else:
        return "Invalid Term"

# Georgia Tech grade mapping
grade_mapping = {
    "A": 4.0,
    "B": 3.0,
    "C": 2.0,
    "D": 1.0,
    "F": 0.0,
    # Other grades that don't affect GPA
    "S": None,  # Satisfactory
    "U": None,  # Unsatisfactory
    "V": None,  # Audit
    "I": None,  # Incomplete
    "W": None,  # Withdrawal
}

# Georgia Tech departments
# This is a comprehensive list of GT departments with auto-mapping for any department code
dept_mapping = {
    "MAIN": {
        "ACCT": "Accounting",
        "AE": "Aerospace Engineering",
        "AS": "Air Force Aerospace Studies",
        "APPH": "Applied Physiology",
        "ASE": "Applied Systems Engineering",
        "ARBC": "Arabic",
        "ARCH": "Architecture",
        "BIOS": "Biological Sciences",
        "BIOL": "Biology",
        "BMEJ": "Biomed Engr/Joint Emory PKU",
        "BMED": "Biomedical Engineering",
        "BMEM": "Biomedical Engr/Joint Emory",
        "BC": "Building Construction",
        "BCP": "Building Construction - Professional",
        "CETL": "Center Enhancement-Teach/Learn",
        "CHBE": "Chemical and Biomolecular Engineering",
        "CHEM": "Chemistry",
        "CHIN": "Chinese",
        "CP": "City Planning",
        "CEE": "Civil and Environmental Engineering",
        "COA": "College of Architecture",
        "COE": "College of Engineering",
        "COS": "College of Sciences",
        "CX": "Computational Modeling, Simulation, & Data",
        "CSE": "Computer Science and Engineering",
        "CS": "Computer Science",
        "COOP": "Cooperative Work Assignment",
        "UCGA": "Cross Enrollment",
        "EAS": "Earth and Atmospheric Sciences",
        "ECON": "Economics",
        "ECEP": "Electrical and Computer Engineering - Professional",
        "ECE": "Electrical and Computer Engineering",
        "ENGL": "English",
        "FS": "Foreign Studies",
        "FREE": "Free Elective",
        "FREN": "French",
        "GT": "Georgia Tech",
        "GTL": "Georgia Tech Lorraine",
        "GRMN": "German",
        "HS": "Health Systems",
        "HEBW": "Hebrew",
        "HIN": "Hindi",
        "HIST": "History",
        "HTS": "History, Technology & Society",
        "HUM": "Humanities Elective",
        "ID": "Industrial Design",
        "ISYE": "Industrial & Systems Engineering",
        "INTA": "International Affairs",
        "IL": "International Logistics",
        "INTN": "Internship",
        "IMBA": "International Executive MBA",
        "IAC": "Ivan Allen College",
        "JAPN": "Japanese",
        "KOR": "Korean",
        "LA": "Latin",
        "LS": "Learning Support",
        "LING": "Linguistics",
        "LMC": "Literature, Media, & Communication",
        "MGT": "Management",
        "MOT": "Management of Technology",
        "MLDR": "Manufacturing Leadership",
        "MSE": "Materials Science and Engineering",
        "MATH": "Mathematics",
        "ME": "Mechanical Engineering",
        "MP": "Medical Physics",
        "MSL": "Military Science & Leadership",
        "ML": "Military Leadership",
        "MUSI": "Music",
        "NS": "Naval Science",
        "NEUR": "Neuroscience",
        "NRE": "Nuclear & Radiological Engineering",
        "PERS": "Persian",
        "PHIL": "Philosophy",
        "PHYS": "Physics",
        "POL": "Political Science",
        "PTFE": "Polymer, Textile, and Fiber Engineering",
        "PORT": "Portuguese",
        "DOPP": "Professional Practive",
        "PSYC": "Psychology",
        "PUBJ": "Public Policy/Joint GSU PhD",
        "PUBP": "Public Policy",
        "RUSS": "Russian",
        "SCI": "Science",
        "SLS": "Serve Learn Sustain",
        "SS": "Social Science Elective",
        "SOC": "Sociology",
        "SPAN": "Spanish",
        "SWAH": "Swahili",
        "VIP": "Vertically Integrated Project",
        "WOLO": "Wolof"
    }
}

# Define libed_mapping (if needed)
libed_mapping = {}