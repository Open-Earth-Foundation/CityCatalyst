from csv import DictReader, DictWriter

LOCODE_COLUMNS = [
    "Ch",
    "ISO 3166-1",
    "LOCODE",
    "Name",
    "NameWoDiacritics",
    "SubDiv",
    "Function",
    "Status",
    "Date",
    "IATA",
    "Coordinates",
    "Remarks"
]

def main(output, inputs):
  with open(output, 'w') as out:
    writer = DictWriter(out, fieldnames=['locode', 'region', 'country'])
    writer.writeheader()
    seen = set()
    for input in inputs:
      with open(input, 'r') as f:
        reader = DictReader(f, fieldnames=LOCODE_COLUMNS)
        for row in reader:
          if not row['LOCODE']:
            continue
          locode = row['ISO 3166-1'] + ' ' + row['LOCODE']
          if locode in seen:
            continue
          seen.add(locode)
          if row['SubDiv']:
            region = row['ISO 3166-1'] + '-' + row['SubDiv']
          else:
            region = None
          country = row['ISO 3166-1']
          writer.writerow({'locode': locode, 'region': region, 'country': country})

if __name__ == '__main__':
  import sys
  main(sys.argv[1], sys.argv[2:])
