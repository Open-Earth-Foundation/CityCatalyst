from csv import DictWriter, DictReader

headers = [
  'locode',
  'year',
  'I.1.1',
  'I.1.2',
  'I.1.3',
  'I.2.1',
  'I.2.2',
  'I.2.3',
  'I.3.1',
  'I.3.2',
  'I.3.3',
  'I.4.1',
  'I.4.2',
  'I.4.3',
  'I.4.4',
  'I.5.1',
  'I.5.2',
  'I.5.3',
  'I.6.1',
  'I.6.2',
  'I.6.3',
  'I.7.1',
  'I.8.1',
  'II.1.1',
  'II.1.2',
  'II.1.3',
  'II.2.1',
  'II.2.2',
  'II.2.3',
  'II.3.1',
  'II.3.2',
  'II.3.3',
  'II.4.1',
  'II.4.2',
  'II.4.3',
  'II.5.1',
  'II.5.2',
  'III.1.1',
  'III.1.2',
  'III.1.3',
  'III.2.1',
  'III.2.2',
  'III.2.3',
  'III.3.1',
  'III.3.2',
  'III.3.3',
  'III.4.1',
  'III.4.2',
  'III.4.3',
  'IV.1',
  'IV.2',
  'V.1',
  'V.2',
  'V.3',
  'VI.1']

def main(inputfile, outputfile):

  data = {}

  with open(inputfile, 'r') as file:
    reader = DictReader(file)
    for row in reader:
      locode = row['locode']
      year = row['year']
      gpc_reference_number = row['gpc_reference_number']
      publisher_id = row['publisher_id']
      total = row['total']
      if locode not in data:
        data[locode] = {}
      if year not in data[locode]:
        data[locode][year] = {}
      if gpc_reference_number not in data[locode][year]:
        data[locode][year][gpc_reference_number] = f'{total} ({publisher_id})'
      else:
        data[locode][year][gpc_reference_number] += f'; {total} ({publisher_id})'

  with open(outputfile, 'w') as file:
    writer = DictWriter(file, fieldnames=headers)
    writer.writeheader()
    for locode in data:
      for year in data[locode]:
        row = {
          'locode': locode,
          'year': year,
          **data[locode][year]
        }
        writer.writerow(row)

if __name__ == "__main__":
  import argparse
  parser = argparse.ArgumentParser(description='Data coverage')
  parser.add_argument('--outputfile', type=str, default='pivoted.csv', help='Output file')
  parser.add_argument('--inputfile', type=str, default='data-coverage.csv', help='Input file')
  args = parser.parse_args()
  main(args.inputfile, args.outputfile)
