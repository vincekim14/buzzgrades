from db.Models import Professor, Session, Distribution
from multiprocessing import Pool
from aiohttp import BasicAuth
from gql.transport.aiohttp import AIOHTTPTransport
from gql import Client, gql
import time
import json
from pathlib import Path

# Fuzzy matching dependencies
try:
    from rapidfuzz import fuzz
    FUZZY_MATCHING_AVAILABLE = True
except ImportError:
    FUZZY_MATCHING_AVAILABLE = False

# Configuration constants
GT_SCHOOL_ID = "U2Nob29sLTM2MQ=="
GT_SCHOOL_NAME = "Georgia Institute of Technology"
RMP_BASE_URL = "https://www.ratemyprofessors.com"
RMP_GRAPHQL_URL = f"{RMP_BASE_URL}/graphql"
MULTIPROCESS_POOL_SIZE = 5

# Fetch RMP data for given GT professor
class RMP:
    def __init__(self):
        self.SCHOOLS = [
            {"id": GT_SCHOOL_ID, "name": GT_SCHOOL_NAME}
        ]
        RMPHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
            "Origin": RMP_BASE_URL,
            "Referer": f"{RMP_BASE_URL}/",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
        }
        self.transport = AIOHTTPTransport(url=RMP_GRAPHQL_URL, auth=BasicAuth("test", "test"), ssl=False, headers=RMPHeaders)
        self.gqlClient = Client(transport=self.transport, fetch_schema_from_transport=False)
        
        # Initialize caching system
        self._cache_file = Path(__file__).parent / "rmp_cache.json"
        self._cache = self._load_cache()
        
        # Nickname mapping for enhanced matching
        self._nickname_map = {
            "robert": ["rob", "bob", "bobby"],
            "william": ["will", "bill", "billy"],
            "james": ["jim", "jimmy"],
            "michael": ["mike", "mick"],
            "david": ["dave", "davy"],
            "richard": ["rick", "dick"],
            "thomas": ["tom", "tommy"],
            "charles": ["charlie", "chuck"],
            "christopher": ["chris"],
            "daniel": ["dan", "danny"],
            "matthew": ["matt"],
            "anthony": ["tony"],
            "joseph": ["joe", "joey"],
            "andrew": ["andy", "drew"],
            "elizabeth": ["liz", "beth", "betty"],
            "margaret": ["meg", "maggie"],
            "patricia": ["pat", "patty"],
            "jennifer": ["jen", "jenny"],
            "susan": ["sue", "suzy"],
            "salvador": ["sal"]
        }

    def _load_cache(self) -> dict:
        """Load cache from disk"""
        default_cache = {"positive": {}, "negative": {}, "manual": {}}
        
        if self._cache_file.exists():
            try:
                with open(self._cache_file, 'r') as f:
                    loaded_cache = json.load(f)
                    # Ensure all required keys exist, preserving existing data
                    for key in default_cache:
                        if key not in loaded_cache:
                            loaded_cache[key] = default_cache[key]
                    return loaded_cache
            except:
                pass
        return default_cache

    def _save_cache(self):
        """Save cache to disk"""
        try:
            with open(self._cache_file, 'w') as f:
                json.dump(self._cache, f)
        except:
            pass

    def _get_cache_key(self, professor_name: str) -> str:
        """Generate cache key for professor name"""
        return professor_name.lower().strip()

    def _is_cache_valid(self, cache_entry: dict, ttl_days: int) -> bool:
        """Check if cache entry is still valid"""
        if "timestamp" not in cache_entry:
            return False
        age_days = (time.time() - cache_entry["timestamp"]) / (24 * 3600)
        return age_days < ttl_days

    def _get_cached_result(self, professor_name: str):
        """Get cached result if available and valid"""
        cache_key = self._get_cache_key(professor_name)
        
        # Check manual cache first (never expires)
        if cache_key in self._cache["manual"]:
            entry = self._cache["manual"][cache_key]
            print(f"[RMP Manual Cache] Found manual entry for {professor_name}")
            return entry["data"]
        
        # Check positive cache (6 months TTL)
        if cache_key in self._cache["positive"]:
            entry = self._cache["positive"][cache_key]
            if self._is_cache_valid(entry, 180):
                return entry["data"]
            else:
                del self._cache["positive"][cache_key]
        
        # Check negative cache (2 weeks TTL)
        if cache_key in self._cache["negative"]:
            entry = self._cache["negative"][cache_key]
            if self._is_cache_valid(entry, 14):
                return []
            else:
                del self._cache["negative"][cache_key]
        
        return None

    def _cache_result(self, professor_name: str, result: list):
        """Cache search result"""
        cache_key = self._get_cache_key(professor_name)
        timestamp = time.time()
        
        if result:
            self._cache["positive"][cache_key] = {
                "data": result,
                "timestamp": timestamp
            }
        else:
            self._cache["negative"][cache_key] = {
                "timestamp": timestamp
            }
        
        self._save_cache()

    def _add_manual_cache_entry(self, professor_name: str, rmp_data: dict):
        """Add manual entry to cache (never expires)"""
        cache_key = self._get_cache_key(professor_name)
        
        # Create RMP-style candidate data from manual entry
        candidate_data = [{
            "node": {
                "avgRating": rmp_data.get("avgRating"),
                "avgDifficulty": rmp_data.get("avgDifficulty"), 
                "wouldTakeAgainPercent": rmp_data.get("wouldTakeAgainPercent"),
                "legacyId": rmp_data.get("legacyId"),
                "firstName": rmp_data.get("firstName", ""),
                "lastName": rmp_data.get("lastName", ""),
                "school": {"id": GT_SCHOOL_ID}
            }
        }]
        
        self._cache["manual"][cache_key] = {
            "data": candidate_data,
            "timestamp": time.time(),
            "source": "manual"
        }
        
        # Remove from negative cache if present
        if cache_key in self._cache["negative"]:
            del self._cache["negative"][cache_key]
            
        self._save_cache()
        print(f"[RMP Manual] Added manual cache entry for {professor_name}")

    def _remove_from_negative_cache(self, professor_name: str):
        """Remove professor from negative cache (used when manually adding)"""
        cache_key = self._get_cache_key(professor_name)
        if cache_key in self._cache["negative"]:
            del self._cache["negative"][cache_key]
            self._save_cache()
            print(f"[RMP Manual] Removed {professor_name} from negative cache")


    def _canonicalize_name(self, name: str) -> str:
        """Clean and normalize name for matching purposes only"""
        if not name:
            return ""
        
        # Strip and normalize whitespace only
        name = " ".join(name.strip().split())
        
        # Remove common academic titles and suffixes (case insensitive) for matching only
        import re
        name = re.sub(r'\b(dr|prof|professor)\.?\s*', '', name, flags=re.IGNORECASE)
        name = re.sub(r'\s+(jr|sr|ii|iii|iv)\.?$', '', name, flags=re.IGNORECASE)
        
        # Final cleanup
        name = " ".join(name.split())
        
        # Convert to lowercase for matching purposes only
        return name.lower()

    def _get_name_variants(self, first_name: str) -> list:
        """Get nickname variants for a first name"""
        canonical_first = self._canonicalize_name(first_name)
        variants = [canonical_first]
        
        # Add nicknames if available
        if canonical_first in self._nickname_map:
            variants.extend(self._nickname_map[canonical_first])
        
        # Check if current name is a nickname and add full names
        for full_name, nicknames in self._nickname_map.items():
            if canonical_first in nicknames:
                variants.append(full_name)
                variants.extend(nicknames)
        
        return list(set(variants))

    def _fuzzy_match_candidates(self, target_name: str, candidates: list) -> list:
        """Apply fuzzy matching to filter candidates with high confidence"""
        if not FUZZY_MATCHING_AVAILABLE or not candidates:
            return candidates
        
        target_canonical = self._canonicalize_name(target_name)
        scored_candidates = []
        
        for candidate in candidates:
            candidate_name = f"{candidate['node']['firstName']} {candidate['node']['lastName']}"
            candidate_canonical = self._canonicalize_name(candidate_name)
            
            # Calculate fuzzy score
            score = fuzz.token_sort_ratio(target_canonical, candidate_canonical) / 100.0
            
            # Only accept high confidence matches to avoid false positives
            if score >= 0.85:
                scored_candidates.append((candidate, score))
        
        # Sort by score (highest first) and return candidates
        scored_candidates.sort(key=lambda x: x[1], reverse=True)
        return [candidate for candidate, score in scored_candidates]

    def _enhanced_match_candidates(self, target_name: str, candidates: list) -> list:
        """Enhanced matching using nicknames and fuzzy matching"""
        if not candidates:
            return []
        
        # Parse target name
        name_parts = target_name.strip().split()
        if len(name_parts) < 2:
            return []
        
        target_first = name_parts[0]
        target_last = " ".join(name_parts[1:])
        
        # Get name variants for first name
        first_variants = self._get_name_variants(target_first)
        
        matched_candidates = []
        
        # Try nickname matching first
        for candidate in candidates:
            candidate_first = self._canonicalize_name(candidate["node"]["firstName"])
            candidate_last = self._canonicalize_name(candidate["node"]["lastName"])
            target_last_clean = self._canonicalize_name(target_last)
            
            # Check if first name matches any variant and last name matches exactly
            if candidate_first in first_variants and candidate_last == target_last_clean:
                matched_candidates.append(candidate)
                continue
        
        # If no nickname matches and fuzzy matching available, try fuzzy matching
        if not matched_candidates and FUZZY_MATCHING_AVAILABLE:
            fuzzy_matches = self._fuzzy_match_candidates(target_name, candidates)
            if fuzzy_matches:
                # Only take the best match to avoid ambiguity
                matched_candidates = [fuzzy_matches[0]]
        
        return matched_candidates

    def _validate_match_quality(self, target_name: str, candidate_name: str, score: float) -> dict:
        """Validate the quality of a potential match and return quality metrics"""
        target_canonical = self._canonicalize_name(target_name)
        candidate_canonical = self._canonicalize_name(candidate_name)
        
        quality_issues = []
        confidence_score = score
        
        # Check for exact match (highest confidence)
        if target_canonical == candidate_canonical:
            return {
                "confidence": 1.0,
                "issues": [],
                "match_type": "exact",
                "recommended_action": "accept"
            }
        
        # Check for potential issues
        target_words = target_canonical.split()
        candidate_words = candidate_canonical.split()
        
        # Different number of name parts
        if len(target_words) != len(candidate_words):
            quality_issues.append("different_name_structure")
            confidence_score *= 0.9
        
        # Check for completely different last names
        if len(target_words) >= 2 and len(candidate_words) >= 2:
            if target_words[-1] != candidate_words[-1]:
                quality_issues.append("different_last_name")
                confidence_score *= 0.7
        
        # Very low fuzzy score
        if score < 0.85:
            quality_issues.append("low_similarity_score")
            confidence_score *= 0.8
        
        # Determine recommendation
        if confidence_score >= 0.90:
            recommendation = "accept"
        elif confidence_score >= 0.75:
            recommendation = "review"
        else:
            recommendation = "reject"
        
        match_type = "fuzzy" if score < 1.0 else "nickname"
        
        return {
            "confidence": confidence_score,
            "issues": quality_issues,
            "match_type": match_type,
            "recommended_action": recommendation
        }

    def get_prof_by_school_and_name(self, college: dict[str, str], professor_name: str) -> dict[str, str | float | int]:
        """Search for a professor by name using GraphQL with caching and enhanced matching."""
        
        # Check cache first
        cached_result = self._get_cached_result(professor_name)
        if cached_result is not None:
            print(f"[RMP Cache] Found cached result for {professor_name}")
            return cached_result
        
        # Optimized search strategy: search by last name first to reduce API calls
        name_parts = professor_name.strip().split()
        if len(name_parts) >= 2:
            first_name = name_parts[0]
            last_name = " ".join(name_parts[1:])
            
            # Primary search: by last name only (more efficient)
            last_name_query = gql("""
                query NewSearchTeachersQuery($professorName: String!, $schoolID: ID!){
                    newSearch{
                        teachers(query: {text: $professorName, schoolID: $schoolID}, first: 25){
                            edges{
                                node{
                                    avgDifficulty
                                    avgRating
                                    wouldTakeAgainPercent
                                    id
                                    firstName
                                    lastName
                                    legacyId
                                    school{
                                        id
                                    }
                                }
                            }
                        }
                    }
                }
            """)
            
            result = self.gqlClient.execute(last_name_query, variable_values={"professorName": last_name, "schoolID": college["id"]})
            candidates = result["newSearch"]["teachers"]["edges"]
            print(f"[RMP GQL] Searched by last name '{last_name}' for {professor_name} at {college['name']}")
        else:
            # Fallback to full name search for single names
            full_name_query = gql("""
                query NewSearchTeachersQuery($professorName: String!, $schoolID: ID!){
                    newSearch{
                        teachers(query: {text: $professorName, schoolID: $schoolID}, first: 25){
                            edges{
                                node{
                                    avgDifficulty
                                    avgRating
                                    wouldTakeAgainPercent
                                    id
                                    firstName
                                    lastName
                                    legacyId
                                    school{
                                        id
                                    }
                                }
                            }
                        }
                    }
                }
            """)
            result = self.gqlClient.execute(full_name_query, variable_values={"professorName": professor_name, "schoolID": college["id"]})
            candidates = result["newSearch"]["teachers"]["edges"]
            print(f"[RMP GQL] Searched for {professor_name} at {college['name']}")
        
        # Cache the result before returning
        self._cache_result(professor_name, candidates)
        
        return candidates

    def update_prof_by_name(self, prof: Professor) -> None:
        """Update a single professor's RMP data in the database with enhanced matching."""
        profMatches = []
        for school in self.SCHOOLS:
            profMatches.extend(self.get_prof_by_school_and_name(school, prof.name))

        # Try exact match first (preserve existing behavior)
        exact_matches = list(filter(lambda x: str.strip(x["node"]["firstName"] + " " + x["node"]["lastName"]) == prof.name, profMatches))
        
        if exact_matches:
            profMatches = exact_matches
            print(f"[RMP Match] Found exact match for {prof.name}")
        else:
            # Try enhanced matching with quality validation
            enhanced_matches = self._enhanced_match_candidates(prof.name, profMatches)
            if enhanced_matches:
                # Validate match quality
                best_match = enhanced_matches[0]
                candidate_name = f"{best_match['node']['firstName']} {best_match['node']['lastName']}"
                
                if FUZZY_MATCHING_AVAILABLE:
                    target_canonical = self._canonicalize_name(prof.name)
                    candidate_canonical = self._canonicalize_name(candidate_name)
                    fuzzy_score = fuzz.token_sort_ratio(target_canonical, candidate_canonical) / 100.0
                    
                    quality_check = self._validate_match_quality(prof.name, candidate_name, fuzzy_score)
                    
                    if quality_check["recommended_action"] == "accept":
                        profMatches = enhanced_matches
                        print(f"[RMP Match] Found high-quality enhanced match for {prof.name} -> {candidate_name} (confidence: {quality_check['confidence']:.2f})")
                    elif quality_check["recommended_action"] == "review":
                        print(f"[RMP Review] Questionable match for {prof.name} -> {candidate_name} (confidence: {quality_check['confidence']:.2f}, issues: {quality_check['issues']})")
                        profMatches = []  # Skip questionable matches for now
                    else:
                        print(f"[RMP Reject] Poor match quality for {prof.name} -> {candidate_name} (confidence: {quality_check['confidence']:.2f}, issues: {quality_check['issues']})")
                        profMatches = []
                else:
                    # Without fuzzy matching, accept enhanced matches (nickname-based)
                    profMatches = enhanced_matches
                    print(f"[RMP Match] Found enhanced match for {prof.name} -> {candidate_name}")
            else:
                profMatches = []
                print(f"[RMP Match] No suitable matches found for {prof.name}")
        if len(profMatches) == 0:
            print(f"[RMP Fail] Failed to find {prof.name}")
            return
        elif len(profMatches) > 1:
            print(f"[RMP Fail] Ambiguous match for {prof.name}")
            return
        else:
            RMP_Prof = profMatches[0]["node"]
            
            # Strict validation - only store if we have valid, complete data
            debug_mode = getattr(self, 'debug_mode', False)
            rmp_data = self._validate_and_extract_rmp_data(RMP_Prof, prof.name, debug=debug_mode)
            
            if rmp_data:
                try:
                    session = Session()
                    session.query(Professor).filter(Professor.id == prof.id).update(rmp_data)
                    session.commit()
                    print(f"[RMP Update] Successfully updated {prof.name} with RMP score {rmp_data[Professor.RMP_score]}")
                except Exception as e:
                    session.rollback()
                    print(f"[RMP Fail] Database error updating {prof.name}: {e}")
                finally:
                    session.close()
            else:
                print(f"[RMP Invalid] Rejected invalid RMP data for {prof.name}")

    def _validate_and_extract_rmp_data(self, rmp_prof_node: dict, professor_name: str, debug: bool = False) -> dict:
        """Validate RMP data and return only if all required fields are valid"""
        try:
            # Extract raw data from RMP GraphQL response
            avg_rating = rmp_prof_node.get("avgRating")
            avg_difficulty = rmp_prof_node.get("avgDifficulty") 
            would_take_again = rmp_prof_node.get("wouldTakeAgainPercent")
            legacy_id = rmp_prof_node.get("legacyId")
            first_name = rmp_prof_node.get("firstName", "")
            last_name = rmp_prof_node.get("lastName", "")
            
            if debug:
                print(f"[RMP Debug] Raw data for {professor_name}:")
                print(f"  avgRating: {avg_rating} (type: {type(avg_rating)})")
                print(f"  avgDifficulty: {avg_difficulty} (type: {type(avg_difficulty)})")
                print(f"  wouldTakeAgainPercent: {would_take_again} (type: {type(would_take_again)})")
                print(f"  legacyId: {legacy_id} (type: {type(legacy_id)})")
                print(f"  RMP Name: {first_name} {last_name}")
            
            # Essential fields check - legacy_id must exist for a valid RMP profile
            if legacy_id is None:
                print(f"[RMP Invalid] No legacy ID found for {professor_name}")
                return None
                
            # Validate legacy ID format
            if not str(legacy_id).isdigit():
                print(f"[RMP Invalid] Invalid legacy ID format '{legacy_id}' for {professor_name}")
                return None
            
            # Handle edge cases for professors with limited/no rating data
            # Some professors have RMP profiles but avgRating/avgDifficulty might be null or 0
            
            # Convert and validate avg_rating
            if avg_rating is None:
                print(f"[RMP Info] Professor {professor_name} has RMP profile but no average rating yet")
                avg_rating = 0.0  # Use 0.0 for unrated professors (valid case)
            else:
                try:
                    avg_rating = float(avg_rating)
                    if not (0 <= avg_rating <= 5):
                        print(f"[RMP Invalid] Rating {avg_rating} out of range for {professor_name}")
                        return None
                except (ValueError, TypeError):
                    print(f"[RMP Invalid] Cannot convert rating '{avg_rating}' to float for {professor_name}")
                    return None
            
            # Convert and validate avg_difficulty  
            if avg_difficulty is None:
                print(f"[RMP Info] Professor {professor_name} has no difficulty rating yet")
                avg_difficulty = 0.0  # Use 0.0 for unrated difficulty
            else:
                try:
                    avg_difficulty = float(avg_difficulty)
                    if not (0 <= avg_difficulty <= 5):
                        print(f"[RMP Invalid] Difficulty {avg_difficulty} out of range for {professor_name}")
                        return None
                except (ValueError, TypeError):
                    print(f"[RMP Invalid] Cannot convert difficulty '{avg_difficulty}' to float for {professor_name}")
                    return None
            
            # Handle would_take_again - this can legitimately be null, -1, or 0-100
            would_take_again_value = None
            if would_take_again is not None:
                try:
                    would_take_again_float = float(would_take_again)
                    if -1 <= would_take_again_float <= 100:  # -1 indicates no data, 0-100 are valid percentages
                        would_take_again_value = would_take_again_float
                    else:
                        print(f"[RMP Warning] Would take again {would_take_again} out of range for {professor_name}")
                        would_take_again_value = None  # Invalid value, store as null
                except (ValueError, TypeError):
                    print(f"[RMP Warning] Cannot convert would_take_again '{would_take_again}' for {professor_name}")
                    would_take_again_value = None
            
            # Generate RMP profile link
            rmp_link = f"{RMP_BASE_URL}/professor/{legacy_id}"
            
            # Success - return validated data (including legitimate 0.0 values)
            result_data = {
                Professor.RMP_score: avg_rating,
                Professor.RMP_diff: avg_difficulty,
                Professor.RMP_would_take_again: would_take_again_value,
                Professor.RMP_link: rmp_link
            }
            
            if debug or (avg_rating == 0.0 and avg_difficulty == 0.0):
                print(f"[RMP Valid] Storing data for {professor_name}: score={avg_rating}, diff={avg_difficulty}, take_again={would_take_again_value}")
            
            return result_data
            
        except Exception as e:
            print(f"[RMP Error] Unexpected error validating data for {professor_name}: {e}")
            print(f"[RMP Error] Raw node data: {rmp_prof_node}")
            return None

    def _verify_rmp_url(self, url: str) -> bool:
        """Optional: Verify that RMP URL is accessible (can be slow)"""
        try:
            import urllib.request
            urllib.request.urlopen(url, timeout=5)
            return True
        except:
            return False


    def _detect_and_merge_duplicates(self) -> None:
        """Automatically detect and merge duplicate professor entries"""
        print("[RMP Duplicates] Checking for duplicate professor entries...")
        session = Session()
        
        try:
            # Find duplicates based on canonical name matching
            professors = session.query(Professor).all()
            canonical_groups = {}
            
            # Group professors by canonical name
            for prof in professors:
                canonical = self._canonicalize_name(prof.name)
                if canonical not in canonical_groups:
                    canonical_groups[canonical] = []
                canonical_groups[canonical].append(prof)
            
            # Find groups with multiple professors (duplicates)
            duplicates_found = 0
            for canonical_name, prof_group in canonical_groups.items():
                if len(prof_group) > 1:
                    duplicates_found += 1
                    print(f"[RMP Duplicates] Found duplicates for '{canonical_name}': {[p.name for p in prof_group]}")
                    
                    # Keep the professor with the most distributions or the lowest ID
                    best_prof = None
                    best_score = -1
                    
                    for prof in prof_group:
                        # Count distributions
                        dist_count = session.query(Distribution).filter(Distribution.professor_id == prof.id).count()
                        score = dist_count * 1000 + (10000 - prof.id)  # Prefer more distributions, then lower ID
                        
                        if score > best_score:
                            best_prof = prof
                            best_score = score
                    
                    # Merge others into the best professor
                    for prof in prof_group:
                        if prof.id != best_prof.id:
                            print(f"[RMP Duplicates] Merging '{prof.name}' (ID {prof.id}) into '{best_prof.name}' (ID {best_prof.id})")
                            
                            # Update distribution references
                            distributions = session.query(Distribution).filter(Distribution.professor_id == prof.id).all()
                            for dist in distributions:
                                dist.professor_id = best_prof.id
                            
                            # Merge RMP data if the duplicate has data and the best doesn't
                            if prof.RMP_score and not best_prof.RMP_score:
                                best_prof.RMP_score = prof.RMP_score
                                best_prof.RMP_diff = prof.RMP_diff
                                best_prof.RMP_link = prof.RMP_link
                                best_prof.RMP_would_take_again = prof.RMP_would_take_again
                                print(f"[RMP Duplicates] Transferred RMP data from duplicate")
                            
                            # Delete the duplicate
                            session.delete(prof)
            
            if duplicates_found > 0:
                session.commit()
                print(f"[RMP Duplicates] Merged {duplicates_found} sets of duplicate professors")
            else:
                print("[RMP Duplicates] No duplicate professors found")
                
        except Exception as e:
            session.rollback()
            print(f"[RMP Error] Failed to merge duplicates: {e}")
        finally:
            session.close()

    def update_professor_name(self, old_name: str, new_name: str) -> bool:
        """Manually update a specific professor's name in the database"""
        try:
            session = Session()
            
            # Find the professor with the old name
            prof = session.query(Professor).filter(Professor.name == old_name).first()
            if not prof:
                print(f"[Manual Name] Professor '{old_name}' not found in database")
                session.close()
                return False
            
            # Check if new name already exists
            existing_prof = session.query(Professor).filter(Professor.name == new_name).first()
            if existing_prof and existing_prof.id != prof.id:
                print(f"[Manual Name] Professor '{new_name}' already exists. Use merge function instead.")
                session.close()
                return False
            
            # Update the name
            prof.name = new_name
            session.commit()
            
            print(f"[Manual Name] Successfully updated professor name: '{old_name}' → '{new_name}'")
            session.close()
            return True
            
        except Exception as e:
            print(f"[Manual Name] Error updating professor name: {e}")
            if 'session' in locals():
                session.rollback()
                session.close()
            return False



    def add_manual_rmp_link(self, professor_name: str, rmp_id: str) -> bool:
        """Manually add RMP data for a professor by RMP ID"""
        try:
            session = Session()
            
            # Find the professor in database
            prof = session.query(Professor).filter(Professor.name == professor_name).first()
            if not prof:
                print(f"[RMP Manual] Professor '{professor_name}' not found in database")
                session.close()
                return False
            
            # Validate RMP ID format
            if not str(rmp_id).isdigit():
                print(f"[RMP Manual] Invalid RMP ID format '{rmp_id}'. Must be numeric.")
                session.close()
                return False
            
            # Create RMP link
            rmp_link = f"{RMP_BASE_URL}/professor/{rmp_id}"
            
            # Try to fetch RMP data using the ID directly
            print(f"[RMP Manual] Attempting to fetch data for {professor_name} using RMP ID {rmp_id}")
            
            # For manual additions, we create a minimal RMP record
            # The actual data can be fetched later or left as placeholders
            rmp_data = {
                "legacyId": int(rmp_id),
                "avgRating": None,  # Will be populated if we fetch
                "avgDifficulty": None,
                "wouldTakeAgainPercent": None,
                "firstName": prof.name.split()[0] if prof.name.split() else "",
                "lastName": " ".join(prof.name.split()[1:]) if len(prof.name.split()) > 1 else ""
            }
            
            # Add to manual cache
            self._add_manual_cache_entry(professor_name, rmp_data)
            
            # Update database with link (minimal data for now)
            prof.RMP_link = rmp_link
            session.commit()
            
            print(f"[RMP Manual] Successfully added manual RMP link for {professor_name}: {rmp_link}")
            print(f"[RMP Manual] Note: Run regular RMP processing to fetch full data for this professor")
            
            session.close()
            return True
            
        except Exception as e:
            print(f"[RMP Manual] Error adding manual RMP link for {professor_name}: {e}")
            if 'session' in locals():
                session.rollback()
                session.close()
            return False

    def import_manual_mappings(self, csv_file_path: str) -> int:
        """Import manual RMP mappings from CSV file"""
        import csv
        import os
        
        if not os.path.exists(csv_file_path):
            print(f"[RMP Manual] CSV file not found: {csv_file_path}")
            return 0
        
        successful_imports = 0
        
        try:
            with open(csv_file_path, 'r', newline='', encoding='utf-8') as file:
                reader = csv.DictReader(file)
                
                # Validate CSV headers
                required_headers = ['professor_name', 'rmp_id']
                if not all(header in reader.fieldnames for header in required_headers):
                    print(f"[RMP Manual] CSV must have headers: {required_headers}")
                    print(f"[RMP Manual] Found headers: {reader.fieldnames}")
                    return 0
                
                print(f"[RMP Manual] Processing manual mappings from {csv_file_path}")
                
                for row_num, row in enumerate(reader, start=2):  # Start at 2 since row 1 is headers
                    professor_name = row['professor_name'].strip()
                    rmp_id = row['rmp_id'].strip()
                    notes = row.get('notes', '').strip()
                    
                    if not professor_name or not rmp_id:
                        print(f"[RMP Manual] Row {row_num}: Skipping empty professor_name or rmp_id")
                        continue
                    
                    print(f"[RMP Manual] Row {row_num}: Processing {professor_name} -> RMP ID {rmp_id}")
                    if notes:
                        print(f"[RMP Manual] Notes: {notes}")
                    
                    if self.add_manual_rmp_link(professor_name, rmp_id):
                        successful_imports += 1
                    else:
                        print(f"[RMP Manual] Row {row_num}: Failed to add {professor_name}")
                        
        except Exception as e:
            print(f"[RMP Manual] Error reading CSV file: {e}")
            return successful_imports
        
        print(f"[RMP Manual] Successfully imported {successful_imports} manual RMP mappings")
        return successful_imports

    def export_unmatched_professors(self, csv_file_path: str) -> int:
        """Export professors without RMP data to CSV for manual research"""
        import csv
        
        try:
            session = Session()
            
            # Find professors without RMP links
            unmatched_profs = session.query(Professor).filter(
                Professor.RMP_link.is_(None)
            ).order_by(Professor.name).all()
            
            if not unmatched_profs:
                print("[RMP Manual] All professors have RMP data - no unmatched professors to export")
                session.close()
                return 0
            
            # Write to CSV
            with open(csv_file_path, 'w', newline='', encoding='utf-8') as file:
                writer = csv.writer(file)
                
                # Write headers
                writer.writerow(['professor_name', 'rmp_id', 'notes'])
                
                # Write professor data with empty rmp_id and notes for manual filling
                for prof in unmatched_profs:
                    writer.writerow([prof.name, '', 'Manual research needed'])
            
            print(f"[RMP Manual] Exported {len(unmatched_profs)} unmatched professors to {csv_file_path}")
            print(f"[RMP Manual] Please research RMP IDs and update the CSV, then use --import-manual to import")
            
            session.close()
            return len(unmatched_profs)
            
        except Exception as e:
            print(f"[RMP Manual] Error exporting unmatched professors: {e}")
            if 'session' in locals():
                session.close()
            return 0

    def update_profs(self, fix_duplicates: bool = True, skip_rmp_updates: bool = False, debug: bool = False) -> None:
        """Update RMP data for all professors using multiprocessing."""
        
        self.debug_mode = debug
        
        # Step 1: Clean up duplicates if requested
        if fix_duplicates:
            self._detect_and_merge_duplicates()
        
        # Step 2: Process RMP updates (only if not skipped)
        if not skip_rmp_updates:
            print(f"[RMP] Starting RMP processing with {MULTIPROCESS_POOL_SIZE} processes...")
            if debug:
                print("[RMP Debug] Debug mode enabled - detailed logging active")
            
            # Any higher multiprocessing pool size gets rate limited by RMP
            with Pool(MULTIPROCESS_POOL_SIZE) as p:
                session = Session()
                profs = session.query(Professor).order_by(Professor.name).all()
                session.close()
                
                print(f"[RMP] Processing {len(profs)} professors for RMP data...")
                p.map(self.update_prof_by_name, profs)
                
            print("[RMP] Completed RMP processing")
        else:
            print("[RMP] Skipping RMP API updates (duplicate cleanup only)")
        
        # Step 3: Verify data integrity
        if debug:
            self._verify_data_integrity()

    def _verify_data_integrity(self) -> None:
        """Verify RMP data integrity after processing"""
        print("[RMP Integrity] Verifying data integrity...")
        session = Session()
        
        try:
            # Check for professors with RMP links but no scores (should not happen)
            invalid_entries = session.query(Professor).filter(
                Professor.RMP_link.isnot(None),
                Professor.RMP_score.is_(None)
            ).all()
            
            if invalid_entries:
                print(f"[RMP Integrity] ISSUE: {len(invalid_entries)} professors have RMP links but no scores:")
                for prof in invalid_entries[:5]:  # Show first 5
                    print(f"  - {prof.name}: {prof.RMP_link}")
            
            # Check for scores outside valid range
            invalid_scores = session.query(Professor).filter(
                Professor.RMP_score.isnot(None),
                ~Professor.RMP_score.between(0, 5)
            ).all()
            
            if invalid_scores:
                print(f"[RMP Integrity] ISSUE: {len(invalid_scores)} professors have scores outside 0-5 range:")
                for prof in invalid_scores[:5]:
                    print(f"  - {prof.name}: score={prof.RMP_score}")
            
            # Check for negative would_take_again values (other than -1 which indicates no data)
            invalid_take_again = session.query(Professor).filter(
                Professor.RMP_would_take_again.isnot(None),
                Professor.RMP_would_take_again < -1
            ).all()
            
            if invalid_take_again:
                print(f"[RMP Integrity] ISSUE: {len(invalid_take_again)} professors have invalid would_take_again values:")
                for prof in invalid_take_again[:5]:
                    print(f"  - {prof.name}: would_take_again={prof.RMP_would_take_again}")
            
            # Summary statistics
            total_profs = session.query(Professor).count()
            with_rmp_links = session.query(Professor).filter(Professor.RMP_link.isnot(None)).count()
            with_valid_scores = session.query(Professor).filter(
                Professor.RMP_score.isnot(None),
                Professor.RMP_score.between(0, 5)
            ).count()
            
            zero_scores = session.query(Professor).filter(Professor.RMP_score == 0.0).count()
            
            print(f"[RMP Integrity] Data Quality Summary:")
            print(f"  Total professors: {total_profs}")
            print(f"  With RMP links: {with_rmp_links}")
            print(f"  With valid scores: {with_valid_scores}")
            print(f"  With 0.0 scores: {zero_scores} (may be legitimate unrated professors)")
            print(f"  Coverage: {(with_valid_scores/total_profs*100):.1f}%")
            
            if len(invalid_entries) == 0 and len(invalid_scores) == 0 and len(invalid_take_again) == 0:
                print("[RMP Integrity] ✅ All data integrity checks passed!")
            else:
                print("[RMP Integrity] ⚠️ Data integrity issues found - see details above")
                
        except Exception as e:
            print(f"[RMP Integrity] Error during verification: {e}")
        finally:
            session.close()