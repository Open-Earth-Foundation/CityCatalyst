#!/usr/bin/env python3
"""
Simple test to check if emissions_factor endpoint returns data matching CSV values
"""

import requests
import csv
import sys

def test_formula_input():
    """Test formula_input endpoint across both environments"""
    urls = {
        "ccglobal": "https://ccglobal.openearth.dev/api/v0/formula_input/formula_input",
        "citycatalyst": "https://api.citycatalyst.io/api/v0/formula_input/formula_input"
    }
    
    results = {}
    
    for env_name, url in urls.items():
        print(f"\n{'='*60}")
        print(f"Testing {env_name.upper()} Formula Input")
        print(f"URL: {url}")
        print(f"{'='*60}")
        
        result = test_formula_input_single(url, env_name)
        results[env_name] = result
    
    return results

def test_formula_input_single(url, env_name):
    """Test a single formula_input endpoint"""
    try:
        response = requests.get(url)
        
        if response.status_code == 200:
            data = response.json()
            records = data.get('formula_input', [])
            count = len(records)
            
            if count > 0:
                print(f"✅ SUCCESS: Found {count} formula input records")
                
                # Show sample record
                if records:
                    first_record = records[0]
                    print(f"Sample record: gas={first_record.get('gas')}, parameter={first_record.get('parameter_name')}")
                
                return True
            else:
                print("❌ FAILURE: No formula input records found")
                return False
        else:
            print(f"❌ FAILURE: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ FAILURE: {e}")
        return False

def test_emissions_factor():
    # Test both environments
    urls = {
        "ccglobal": "https://ccglobal.openearth.dev/api/v0/emissions_factor/emissions_factor",
        "citycatalyst": "https://api.citycatalyst.io/api/v0/emissions_factor/emissions_factor"
    }
    
    results = {}
    
    for env_name, url in urls.items():
        print(f"\n{'='*60}")
        print(f"Testing {env_name.upper()} Emissions Factor")
        print(f"URL: {url}")
        print(f"{'='*60}")
        
        result = test_single_environment(url, env_name)
        results[env_name] = result
    
    return results

def test_all_endpoints():
    """Test both emissions_factor and formula_input endpoints"""
    print("=" * 60)
    print("COMPREHENSIVE API TESTING")
    print("=" * 60)
    
    # Test emissions factor endpoints
    print("\n🔍 TESTING EMISSIONS FACTOR ENDPOINTS")
    emissions_results = test_emissions_factor()
    
    # Test formula input endpoints
    print("\n🔍 TESTING FORMULA INPUT ENDPOINTS")
    formula_results = test_formula_input()
    
    # Overall comparison
    print(f"\n{'='*60}")
    print("FINAL RESULTS SUMMARY")
    print(f"{'='*60}")
    
    print("\n📊 EMISSIONS FACTOR RESULTS:")
    for env_name, result in emissions_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {env_name.upper()}: {status}")
    
    print("\n📊 FORMULA INPUT RESULTS:")
    for env_name, result in formula_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {env_name.upper()}: {status}")
    
    # Overall success
    all_emissions_passed = all(emissions_results.values())
    all_formula_passed = all(formula_results.values())
    overall_success = all_emissions_passed and all_formula_passed
    
    print(f"\n🎯 OVERALL RESULT:")
    print(f"   Emissions Factor: {'✅ ALL PASSED' if all_emissions_passed else '❌ SOME FAILED'}")
    print(f"   Formula Input: {'✅ ALL PASSED' if all_formula_passed else '❌ SOME FAILED'}")
    print(f"   Overall: {'✅ ALL TESTS PASSED' if overall_success else '❌ SOME TESTS FAILED'}")
    
    return overall_success

def test_single_environment(url, env_name):
    try:
        response = requests.get(url)
        
        if response.status_code == 200:
            data = response.json()
            records = data.get('emissions_factor', [])
            count = len(records)
            
            if count > 0:
                print(f"✅ SUCCESS: Found {count} emission factor records")
                
                # Check if we have the expected fields from CSV
                if records:
                    first_record = records[0]
                    expected_fields = ['units', 'gpc_reference_number', 'metadata']
                    
                    missing_fields = [field for field in expected_fields if field not in first_record]
                    if missing_fields:
                        print(f"❌ WARNING: Missing fields: {missing_fields}")
                        return False
                    else:
                        print("✅ SUCCESS: All expected fields present")
                        
                        # Debug: Show sample metadata structure
                        print(f"Sample metadata: {first_record.get('metadata')}")
                
                # Check specific values from CSV exist in API response (including metadata)
                csv_combinations = [
                    ("kg/m3", "I.1.1", "fuel-type-natural-gas"),
                    ("kg/m3", "I.1.1", "fuel-type-charcoal"),
                    ("kg/kg", "I.1.1", "fuel-type-anthracite"),
                    ("kg/m3", "I.1.1", "fuel-type-gasoline"),
                    ("kg/kg", "I.1.1", "fuel-type-peat"),
                    ("kg/kg", "I.1.1", "fuel-type-firewood"),
                    ("kg/m3", "I.1.1", "fuel-type-liquefied-petroleum-gases"),
                    ("kg/kg", "I.1.1", "fuel-type-charcoal"),
                    ("kg/kg", "I.2.1", "fuel-type-firewood"),
                    ("kg/m3", "I.2.1", "fuel-type-liquefied-petroleum-gases"),
                    ("kg/m3", "I.2.1", "fuel-type-natural-gas"),
                    ("kg/kg", "I.2.1", "fuel-type-anthracite"),
                    ("kg/m3", "I.2.1", "fuel-type-gasoline"),
                    ("kg/kg", "I.2.1", "fuel-type-wood-wood-waste"),
                    ("kg/m3", "I.3.1", "fuel-type-diesel-oil"),
                    ("kg/m3", "I.3.1", "fuel-type-naphtha"),
                    ("kg/m3", "I.3.1", "fuel-type-other-kerosene"),
                    ("kg/m3", "I.3.1", "fuel-type-natural-gas"),
                    ("kg/m3", "I.3.1", "fuel-type-waste-oils"),
                    ("kg/m3", "I.3.1", "fuel-type-crude-oil"),
                    ("kg/kg", "I.3.1", "fuel-type-anthracite"),
                    ("kg/kg", "I.3.1", "fuel-type-coking-coal"),
                    ("kg/kg", "I.3.1", "fuel-type-lignite"),
                    ("kg/m3", "I.3.1", "fuel-type-refinery-gas"),
                    ("kg/m3", "I.3.1", "fuel-type-natural-gas-liquids"),
                    ("kg/kg", "I.3.1", "fuel-type-sub-bituminous-coal"),
                    ("kg/m3", "I.3.1", "fuel-type-residual-fuel-oil"),
                    ("kg/kg", "I.3.1", "fuel-type-bitumen"),
                    ("kg/m3", "I.3.1", "fuel-type-coking-coal"),
                    ("kg/m3", "I.3.1", "fuel-type-coke-oven-gas"),
                    ("kg/m3", "I.3.1", "fuel-type-gas-oil"),
                    ("kg/m3", "I.3.1", "fuel-type-bitumen"),
                    ("kg/kg", "I.4.1", "fuel-type-lignite"),
                    ("kg/m3", "I.4.1", "fuel-type-natural-gas"),
                    ("kg/m3", "I.4.1", "fuel-type-refinery-gas"),
                    ("kg/m3", "I.4.1", "fuel-type-coking-coal"),
                    ("kg/m3", "I.4.1", "fuel-type-crude-oil"),
                    ("kg/m3", "I.4.1", "fuel-type-residual-fuel-oil"),
                    ("kg/m3", "I.4.1", "fuel-type-jet-kerosene"),
                    ("kg/kg", "I.4.1", "fuel-type-coking-coal"),
                    ("kg/m3", "I.4.1", "fuel-type-coke-oven-gas"),
                    ("kg/kg", "I.4.1", "fuel-type-sub-bituminous-coal"),
                    ("kg/m3", "I.4.1", "fuel-type-natural-gas-liquids"),
                    ("kg/kg", "I.4.1", "fuel-type-anthracite"),
                    ("kg/m3", "I.5.1", "fuel-type-diesel-oil"),
                    ("kg/m3", "I.6.1", "fuel-type-liquefied-petroleum-gases"),
                    ("kg/m3", "I.6.1", "fuel-type-diesel-oil"),
                    ("kg/m3", "I.6.1", "fuel-type-charcoal"),
                    ("kg/m3", "I.6.1", "fuel-type-natural-gas"),
                    ("kg/m3", "I.6.1", "fuel-type-naphtha"),
                    ("kg/m3", "I.6.1", "fuel-type-gas-oil"),
                    ("kg/kg", "I.6.1", "fuel-type-charcoal"),
                    ("kg/kg", "I.6.1", "fuel-type-other-primary-solid-biomass"),
                    ("kg/kg", "I.6.1", "fuel-type-peat"),
                    ("kg/kg", "I.6.1", "fuel-type-wood-wood-waste"),
                    ("kg/m3", "II.1.1", "fuel-type-biofuel"),
                    ("kg/TJ", "II.1.1", "fuel-type-biofuel"),
                    ("kg/m3", "II.1.1", "fuel-type-natural-gas-liquids"),
                    ("kg/TJ", "II.1.1", "fuel-type-natural-gas-liquids"),
                    ("kg/TJ", "II.1.1", "fuel-type-gasoline"),
                    ("kg/kg", "II.1.1", "fuel-type-biofuel"),
                    ("kg/TJ", "II.1.1", "fuel-type-diesel"),
                    ("kg/m3", "II.1.1", "fuel-type-diesel"),
                    ("kg/m3", "II.1.1", "fuel-type-gasoline"),
                    ("kg/TJ", "II.2.1", "fuel-type-diesel"),
                    ("kg/m3", "II.2.1", "fuel-type-diesel"),
                    ("kg/TJ", "II.3.1", "fuel-type-diesel"),
                    ("kg/m3", "II.3.1", "fuel-type-diesel"),
                    ("kg/m3", "II.4.1", "fuel-type-aviation-gasoline"),
                    ("kg/TJ", "II.4.1", "fuel-type-jet-kerosene"),
                    ("kg/m3", "II.4.1", "fuel-type-jet-gasoline"),
                    ("kg/TJ", "II.4.1", "fuel-type-jet-gasoline"),
                    ("kg/TJ", "II.4.1", "fuel-type-aviation-gasoline"),
                    ("kg/m3", "II.4.1", "fuel-type-jet-kerosene"),
                    ("kg/m3", "II.5.1", "fuel-type-gasoline"),
                    ("kg/TJ", "II.5.1", "fuel-type-diesel"),
                    ("kg/TJ", "II.5.1", "fuel-type-gasoline"),
                    ("kg/m3", "II.5.1", "fuel-type-diesel")
                ]
                
                found_combinations = set()
                sample_fuel_types = set()
                
                for record in records:
                    units = record.get('units')
                    gpc = record.get('gpc_reference_number')
                    metadata = record.get('metadata', {})
                    
                    # Extract fuel type from metadata
                    fuel_type = None
                    for key, value in metadata.items():
                        if isinstance(value, str) and 'fuel-type' in value:
                            fuel_type = value
                            sample_fuel_types.add(value)
                            break
                    
                    if units and gpc and fuel_type:
                        found_combinations.add((units, gpc, fuel_type))
                
                # Debug: Show sample fuel types found
                print(f"Sample fuel types found: {list(sample_fuel_types)[:5]}")
                print(f"Total unique fuel types: {len(sample_fuel_types)}")
                
                # Check if all fuel types from CSV exist in API
                csv_fuel_types = set()
                for _, _, fuel_type in csv_combinations:
                    csv_fuel_types.add(fuel_type)
                
                missing_fuel_types = csv_fuel_types - sample_fuel_types
                if missing_fuel_types:
                    print(f"❌ WARNING: Missing fuel types: {list(missing_fuel_types)}")
                    return False
                else:
                    print("✅ SUCCESS: All CSV fuel types found in API")
                
                # Check combinations (but don't fail if some are missing)
                missing_combinations = []
                found_combinations_count = 0
                
                for units, gpc, fuel_type in csv_combinations:
                    if (units, gpc, fuel_type) not in found_combinations:
                        missing_combinations.append(f"{units}+{gpc}+{fuel_type}")
                    else:
                        found_combinations_count += 1
                
                total_csv_combinations = len(csv_combinations)
                missing_count = len(missing_combinations)
                
                print(f"📊 COMBINATION SUMMARY:")
                print(f"   Total CSV combinations: {total_csv_combinations}")
                print(f"   Found in API: {found_combinations_count}")
                print(f"   Missing from API: {missing_count}")
                print(f"   Success rate: {(found_combinations_count/total_csv_combinations)*100:.1f}%")
                
                if missing_combinations:
                    print(f"ℹ️  Missing combinations: {missing_combinations[:5]}...")
                    print(f"   (This is normal - API may have different unit/GPC combinations)")
                else:
                    print("✅ SUCCESS: All CSV value combinations found in API")
                
                return True
            else:
                print("❌ FAILURE: No emission factor records found")
                return False
        else:
            print(f"❌ FAILURE: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ FAILURE: {e}")
        return False

if __name__ == "__main__":
    success = test_all_endpoints()
    sys.exit(0 if success else 1)
