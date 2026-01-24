#!/usr/bin/env python3
"""
expand-dealer-coverage.py
Expand dealer coverage_zips to include all ZIP codes within a given radius.

RUN THIS ON YOUR LOCAL MACHINE (not in Claude's sandbox) - it needs to download
the ZIP code database from the internet.

Requirements:
    pip install pgeocode numpy

Usage:
    python3 expand-dealer-coverage.py [radius_miles] [input_json] [output_json]
    
Examples:
    python3 expand-dealer-coverage.py 50 dealers_processed.json dealers_expanded.json
    python3 expand-dealer-coverage.py 30  # Uses defaults
    python3 expand-dealer-coverage.py 75  # Larger radius for rural areas
"""

import json
import sys
import numpy as np

# pgeocode downloads postal code data automatically on first run
import pgeocode

# =============================================================================
# CONFIGURATION
# =============================================================================

DEFAULT_RADIUS_MILES = 50

# =============================================================================
# HAVERSINE DISTANCE (VECTORIZED)
# =============================================================================

def haversine_vec(lat1, lon1, lats, lons):
    """
    Calculate distance in miles from a point to an array of points.
    Uses numpy for fast vectorized computation.
    """
    R = 3959  # Earth radius in miles
    
    lat1_rad = np.radians(lat1)
    lats_rad = np.radians(lats)
    dlat = np.radians(lats - lat1)
    dlon = np.radians(lons - lon1)
    
    a = np.sin(dlat/2)**2 + np.cos(lat1_rad) * np.cos(lats_rad) * np.sin(dlon/2)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    
    return R * c

# =============================================================================
# MAIN
# =============================================================================

def main():
    # Parse args
    radius_miles = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RADIUS_MILES
    input_file = sys.argv[2] if len(sys.argv) > 2 else 'dealers_processed.json'
    output_file = sys.argv[3] if len(sys.argv) > 3 else 'dealers_expanded.json'
    
    print("=" * 60)
    print("TLC Dealer Coverage Expansion")
    print("=" * 60)
    print(f"Radius: {radius_miles} miles")
    print(f"Input:  {input_file}")
    print(f"Output: {output_file}")
    
    # Load ZIP code database (downloads on first run)
    print("\n📥 Loading US ZIP code database...")
    print("   (First run downloads ~2MB from geonames.org)")
    nomi = pgeocode.Nominatim('us')
    
    # Get all ZIP codes with valid coordinates
    all_zips_df = nomi._data
    valid = all_zips_df[
        all_zips_df['latitude'].notna() & 
        all_zips_df['longitude'].notna()
    ].copy()
    
    print(f"   Loaded {len(valid)} ZIP codes with coordinates")
    
    # Create lookup structures for fast computation
    zip_coords = {}
    for _, row in valid.iterrows():
        z = str(row['postal_code']).zfill(5)
        zip_coords[z] = (row['latitude'], row['longitude'])
    
    all_zip_list = list(zip_coords.keys())
    all_lats = np.array([zip_coords[z][0] for z in all_zip_list])
    all_lons = np.array([zip_coords[z][1] for z in all_zip_list])
    
    # Load dealers
    print(f"\n📂 Loading dealers from {input_file}")
    with open(input_file, 'r') as f:
        dealers = json.load(f)
    print(f"   Found {len(dealers)} dealers")
    
    # Process each dealer
    print(f"\n🔄 Expanding coverage to {radius_miles} mile radius...\n")
    
    stats = {
        'expanded': 0,
        'skipped_no_zip': 0,
        'skipped_not_found': 0,
        'total_zips': 0,
        'min_coverage': float('inf'),
        'max_coverage': 0
    }
    
    for i, dealer in enumerate(dealers):
        name = dealer['dealer_name']
        dealer_zip = dealer.get('address', {}).get('zip')
        
        # Handle missing ZIP
        if not dealer_zip:
            print(f"   ⚠️  {name}: No ZIP code")
            stats['skipped_no_zip'] += 1
            dealer['coverage_zips'] = []
            continue
        
        # Clean/normalize ZIP
        dealer_zip = str(dealer_zip).strip()
        if not dealer_zip.isdigit():
            dealer_zip = ''.join(c for c in dealer_zip if c.isdigit())
        dealer_zip = dealer_zip.zfill(5)[:5]
        
        # Check if ZIP exists in database
        if dealer_zip not in zip_coords:
            print(f"   ⚠️  {name}: ZIP {dealer_zip} not found in database")
            stats['skipped_not_found'] += 1
            dealer['coverage_zips'] = [dealer_zip]  # At least cover own ZIP
            continue
        
        # Get center coordinates
        center_lat, center_lon = zip_coords[dealer_zip]
        
        # Calculate distances to ALL ZIPs (vectorized = fast)
        distances = haversine_vec(center_lat, center_lon, all_lats, all_lons)
        
        # Find ZIPs within radius
        mask = distances <= radius_miles
        nearby_zips = sorted([all_zip_list[j] for j in range(len(all_zip_list)) if mask[j]])
        
        # Update dealer
        dealer['coverage_zips'] = nearby_zips
        dealer['coverage_radius_miles'] = radius_miles
        
        # Track stats
        coverage_count = len(nearby_zips)
        stats['expanded'] += 1
        stats['total_zips'] += coverage_count
        stats['min_coverage'] = min(stats['min_coverage'], coverage_count)
        stats['max_coverage'] = max(stats['max_coverage'], coverage_count)
        
        # Progress
        if (i + 1) % 20 == 0 or i == len(dealers) - 1:
            print(f"   Processed {i + 1}/{len(dealers)} dealers...")
    
    # Save output
    print(f"\n💾 Saving to {output_file}")
    with open(output_file, 'w') as f:
        json.dump(dealers, f, indent=2)
    
    # Print summary
    print("\n" + "=" * 60)
    print("✅ COMPLETE")
    print("=" * 60)
    print(f"   Dealers expanded:     {stats['expanded']}")
    print(f"   Skipped (no ZIP):     {stats['skipped_no_zip']}")
    print(f"   Skipped (not found):  {stats['skipped_not_found']}")
    print(f"   Total coverage ZIPs:  {stats['total_zips']:,}")
    if stats['expanded'] > 0:
        avg = stats['total_zips'] // stats['expanded']
        print(f"   Avg ZIPs per dealer:  {avg}")
        print(f"   Min coverage:         {stats['min_coverage']} ZIPs")
        print(f"   Max coverage:         {stats['max_coverage']} ZIPs")
    
    # Show samples
    print("\n📋 Sample dealers:")
    samples = [d for d in dealers if len(d.get('coverage_zips', [])) > 10][:3]
    for s in samples:
        zips = s.get('coverage_zips', [])
        print(f"\n   {s['dealer_name']}")
        print(f"   └─ {s['address']['city']}, {s['address']['state']} {s['address']['zip']}")
        print(f"   └─ Covers {len(zips)} ZIPs: {', '.join(zips[:8])}...")
    
    # Recommendations
    print("\n" + "=" * 60)
    print("📌 NEXT STEPS")
    print("=" * 60)
    print(f"1. Review {output_file}")
    print("2. Copy to your project and run seed script:")
    print("   node seed-dealers-from-excel.js --clear")
    print("")
    print("NOTE: If dealers have overlapping coverage, leads will")
    print("route to the highest priority_weight dealer (Top 50 = 100).")

if __name__ == '__main__':
    main()
