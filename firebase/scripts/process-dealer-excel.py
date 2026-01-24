#!/usr/bin/env python3
"""
process-dealer-excel.py
Process dealer Excel file and generate JSON for Firestore seeding.

Usage:
    python3 process-dealer-excel.py <excel_file> [output_json]
    
Example:
    python3 process-dealer-excel.py "Dream_Team_-_Cool_Kids_top_50.xlsx" dealers.json
"""

import pandas as pd
import re
import json
import sys
from pathlib import Path

def clean_phone(phone_str):
    """Extract primary phone number"""
    if pd.isna(phone_str):
        return None
    first = str(phone_str).split('\n')[0].strip()
    first = re.sub(r'^c\s*-\s*', '', first)
    return first if first else None

def clean_email(email_str):
    """Extract primary email"""
    if pd.isna(email_str):
        return None
    first = str(email_str).split('\n')[0].strip()
    return first.lower() if first and '@' in first else None

def clean_state(state):
    """Normalize state to uppercase"""
    if pd.isna(state):
        return None
    return str(state).upper().strip()

def clean_zip(zip_val):
    """Clean ZIP code"""
    if pd.isna(zip_val):
        return None
    zip_str = str(int(zip_val)) if isinstance(zip_val, float) else str(zip_val)
    return zip_str.zfill(5) if zip_str.isdigit() else zip_str

def generate_dealer_id(name):
    """Generate a URL-safe dealer ID"""
    clean = re.sub(r'[^a-zA-Z0-9]+', '_', name.lower().strip())
    clean = re.sub(r'_+', '_', clean).strip('_')
    return clean[:50]

def process_excel(excel_path, output_path=None):
    """Process Excel file and return dealer list"""
    
    print(f"📂 Reading: {excel_path}")
    
    # Read both sheets
    df_112 = pd.read_excel(excel_path, sheet_name='112 Dealers', header=None)
    df_top50 = pd.read_excel(excel_path, sheet_name='Top 50', header=None)
    
    columns = ['dealer_name', 'contact_name', 'notes', 'phone', 'address', 
               'city', 'state', 'zip', 'email', 'email2', 'extra']
    df_112.columns = columns
    df_top50.columns = columns
    
    # Get Top 50 names for priority flagging
    top50_names = set(df_top50['dealer_name'].str.lower().str.strip())
    
    print(f"   112 Dealers sheet: {len(df_112)} rows")
    print(f"   Top 50 sheet: {len(df_top50)} rows")
    
    # Process all dealers
    dealers = []
    for _, row in df_112.iterrows():
        name = str(row['dealer_name']).strip() if pd.notna(row['dealer_name']) else 'Unknown'
        is_top50 = name.lower().strip() in top50_names
        
        dealer = {
            'dealer_id': generate_dealer_id(name),
            'dealer_name': name,
            'status': 'active',
            'primary_contact_name': str(row['contact_name']).split('\n')[0].strip() if pd.notna(row['contact_name']) else None,
            'primary_contact_email': clean_email(row['email']),
            'primary_phone': clean_phone(row['phone']),
            'address': {
                'street': str(row['address']).strip() if pd.notna(row['address']) else None,
                'city': str(row['city']).strip() if pd.notna(row['city']) else None,
                'state': clean_state(row['state']),
                'zip': clean_zip(row['zip']),
            },
            'coverage_zips': [clean_zip(row['zip'])] if pd.notna(row['zip']) else [],
            'priority_weight': 100 if is_top50 else 50,
            'lead_delivery_method': 'email',
            'is_top50': is_top50,
            'notes': str(row['notes']).strip() if pd.notna(row['notes']) else None,
        }
        dealers.append(dealer)
    
    # Handle duplicate IDs
    ids = [d['dealer_id'] for d in dealers]
    duplicates = set(x for x in ids if ids.count(x) > 1)
    if duplicates:
        print(f"⚠️  Handling {len(duplicates)} duplicate IDs: {duplicates}")
        seen = {}
        for d in dealers:
            base_id = d['dealer_id']
            if ids.count(base_id) > 1:
                seen[base_id] = seen.get(base_id, 0) + 1
                if seen[base_id] > 1:
                    d['dealer_id'] = f"{base_id}_{seen[base_id]}"
    
    # Summary stats
    states = sorted(set(d['address']['state'] for d in dealers if d['address']['state']))
    missing_email = sum(1 for d in dealers if not d['primary_contact_email'])
    missing_zip = sum(1 for d in dealers if not d['coverage_zips'])
    
    print(f"\n✅ Processed {len(dealers)} dealers")
    print(f"   Top 50 flagged: {sum(1 for d in dealers if d['is_top50'])}")
    print(f"   Missing email: {missing_email}")
    print(f"   Missing ZIP: {missing_zip}")
    print(f"   States ({len(states)}): {', '.join(states)}")
    
    # Save JSON
    if output_path:
        with open(output_path, 'w') as f:
            json.dump(dealers, f, indent=2)
        print(f"\n📄 Saved to: {output_path}")
    
    return dealers

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    excel_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else 'dealers_processed.json'
    
    if not Path(excel_path).exists():
        print(f"❌ File not found: {excel_path}")
        sys.exit(1)
    
    dealers = process_excel(excel_path, output_path)
    
    # Also print sample for verification
    print("\n📋 Sample dealer:")
    print(json.dumps(dealers[0], indent=2))

if __name__ == '__main__':
    main()
