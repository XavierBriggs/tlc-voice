# Data Attribution

## US ZIP Code Database

The `scripts/data/reference/us_zipcodes.json` file contains US ZIP code coordinates from [GeoNames](https://www.geonames.org/).

**Source:** https://download.geonames.org/export/zip/US.zip

**License:** [Creative Commons Attribution 4.0](http://creativecommons.org/licenses/by/4.0/)

**Attribution:** ZIP code data provided by GeoNames (www.geonames.org)

## Usage

This data is used to:
1. Generate ZIP coverage for dealers based on a radius rule
2. Calculate distances between ZIP codes using the Haversine formula

## Regenerating Data

To update the ZIP code database:

```bash
# Download latest GeoNames data
cd firebase/scripts/data
curl -L -o US.zip "https://download.geonames.org/export/zip/US.zip"
unzip -o US.zip

# Convert to JSON
cd ..
node convert-geonames-to-json.js

# Clean up
rm data/US.zip data/US.txt data/readme.txt
```
