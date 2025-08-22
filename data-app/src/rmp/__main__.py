try:
    from .rmp import RMP
except ImportError:
    # Handle case when run directly (not as package)
    import sys
    import os
    # Add data-app root to path so db module can be found
    sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
    sys.path.append(os.path.dirname(__file__))
    from rmp import RMP
import sys
import argparse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def main():
    parser = argparse.ArgumentParser(description='Standalone RMP Processing')
    parser.add_argument('--fix-duplicates', action='store_true', 
                       help='Detect and merge duplicate professor entries')
    parser.add_argument('--rmp-only', action='store_true',
                       help='Only fetch RMP data, skip cleanup operations')
    parser.add_argument('--add-manual', type=str, metavar='PROFESSOR_NAME',
                       help='Manually add RMP link for specified professor (requires --rmp-id)')
    parser.add_argument('--rmp-id', type=str, metavar='RMP_ID',
                       help='RMP ID to use with --add-manual (numeric ID from RMP URL)')
    parser.add_argument('--import-manual', type=str, metavar='CSV_FILE',
                       help='Import manual RMP mappings from CSV file (default: rmp_requests_by_users.csv)')
    parser.add_argument('--export-unmatched', type=str, metavar='CSV_FILE',
                       help='Export professors without RMP data to CSV for manual research')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be done without making changes')
    parser.add_argument('--stats-only', action='store_true',
                       help='Show current RMP coverage statistics only')
    parser.add_argument('--validate-urls', action='store_true',
                       help='Verify RMP URLs are accessible (slower)')
    parser.add_argument('--debug', action='store_true',
                       help='Enable detailed debugging output for RMP processing')
    
    args = parser.parse_args()
    
    # Initialize database connection
    try:
        from db.Models import Base
        gt_engine = create_engine("sqlite:///./ProcessedData.db", echo=False, future=True)
        
        # Override the Session for RMP module
        import db.Models
        db.Models.Session = sessionmaker(bind=gt_engine, autoflush=False)
        
        rmp = RMP()
        
        # Stats only mode
        if args.stats_only:
            print("[RMP Stats] Generating RMP coverage statistics...")
            show_rmp_statistics()
            return 0
        
        # Manual RMP operations
        if args.add_manual:
            if not args.rmp_id:
                print("[RMP Error] --add-manual requires --rmp-id parameter")
                return 1
            
            print(f"[RMP Manual] Adding manual RMP link for '{args.add_manual}' with ID '{args.rmp_id}'")
            success = rmp.add_manual_rmp_link(args.add_manual, args.rmp_id)
            return 0 if success else 1
        
        if args.import_manual:
            # Use provided file or default to rmp_requests_by_users.csv
            csv_file = args.import_manual if args.import_manual != 'default' else 'rmp_requests_by_users.csv'
            print(f"[RMP Manual] Importing manual mappings from {csv_file}")
            count = rmp.import_manual_mappings(csv_file)
            print(f"[RMP Manual] Import completed: {count} professors processed")
            return 0
        
        if args.export_unmatched:
            print(f"[RMP Manual] Exporting unmatched professors to {args.export_unmatched}")
            count = rmp.export_unmatched_professors(args.export_unmatched)
            print(f"[RMP Manual] Export completed: {count} professors exported")
            return 0
        
        # Dry run mode
        if args.dry_run:
            print("[RMP DRY RUN] Showing what would be done (no changes will be made)")
            if args.fix_duplicates:
                print("[RMP DRY RUN] Would detect and merge duplicates")
            if args.rmp_only:
                print("[RMP DRY RUN] Would process RMP updates for all professors")
            if args.add_manual and args.rmp_id:
                print(f"[RMP DRY RUN] Would add manual RMP link for '{args.add_manual}' with ID '{args.rmp_id}'")
            if args.import_manual:
                csv_file = args.import_manual if args.import_manual != 'default' else 'rmp_requests_by_users.csv'
                print(f"[RMP DRY RUN] Would import manual mappings from {csv_file}")
            if args.export_unmatched:
                print(f"[RMP DRY RUN] Would export unmatched professors to {args.export_unmatched}")
            elif not any([args.fix_duplicates, args.add_manual, args.import_manual, args.export_unmatched]):
                print("[RMP DRY RUN] Would run full processing (RMP updates + duplicate detection)")
            return 0
        
        # Determine what operations to run
        fix_duplicates = args.fix_duplicates
        skip_rmp_updates = False
        
        if args.rmp_only:
            # Only RMP updates, no cleanup
            fix_duplicates = False
            skip_rmp_updates = False
            print("[RMP] RMP-only mode: fetching RMP data without cleanup")
        elif args.fix_duplicates:
            # Cleanup operations only, skip RMP updates
            skip_rmp_updates = True
            print("[RMP] Cleanup-only mode: running duplicate detection")
        else:
            # No specific options, do full processing (only if no manual operations were done)
            if not any([args.add_manual, args.import_manual, args.export_unmatched]):
                fix_duplicates = True
                skip_rmp_updates = False
                print("[RMP] No specific options provided - running full processing")
            else:
                # Manual operations were already handled above, don't run additional processing
                print("[RMP] Manual operations completed")
                return 0
        
        print("[RMP] Starting enhanced RMP processing...")
        rmp.update_profs(fix_duplicates=fix_duplicates, skip_rmp_updates=skip_rmp_updates, debug=args.debug)
        print("[RMP] Completed RMP processing")
        
        # Show final statistics
        show_rmp_statistics()
        
        return 0
        
    except Exception as e:
        print(f"[RMP Error] Failed to process: {e}")
        return 1

def show_rmp_statistics():
    # Display current RMP coverage statistics
    try:
        from db.Models import Session, Professor
        session = Session()
        
        total_profs = session.query(Professor).count()
        with_rmp = session.query(Professor).filter(Professor.RMP_score.isnot(None)).count()
        coverage = (with_rmp / total_profs * 100) if total_profs > 0 else 0
        
        print(f"[RMP Stats] Total Professors: {total_profs}")
        print(f"[RMP Stats] With RMP Data: {with_rmp}")
        print(f"[RMP Stats] Coverage: {coverage:.1f}%")
        
        # Show top/bottom rated if we have data
        if with_rmp > 0:
            top_rated = session.query(Professor).filter(Professor.RMP_score.isnot(None))\
                              .order_by(Professor.RMP_score.desc()).limit(3).all()
            print(f"[RMP Stats] Top Rated: {[(p.name, p.RMP_score) for p in top_rated]}")
        
        session.close()
        
    except Exception as e:
        print(f"[RMP Error] Could not generate statistics: {e}")

if __name__ == "__main__":
    sys.exit(main())