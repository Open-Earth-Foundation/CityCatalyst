from csv import DictReader, DictWriter
import sys
import csv

csv.field_size_limit(sys.maxsize)

def main(key, output, inputs):
  merged = {}
  fieldnames = None
  for file in inputs:
    with open(file, 'r') as f:
      reader = DictReader(f)
      if not fieldnames:
        fieldnames = reader.fieldnames
      for row in reader:
        merged[row[key]] = row

  with open(output, 'w') as f:
    writer = DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for row in merged.values():
      writer.writerow(row)

if __name__ == '__main__':
  import sys
  main(sys.argv[1], sys.argv[2], sys.argv[3:])
