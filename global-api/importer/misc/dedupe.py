from csv import DictReader, DictWriter
import sys
import csv

csv.field_size_limit(sys.maxsize)

def main(input, output, key):
  seen = set()
  with open(input, 'r') as f:
      reader = DictReader(f)
      with open(output, 'w') as f:
        writer = DictWriter(f, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            if row[key] in seen:
                continue
            seen.add(row[key])
            writer.writerow(row)

if __name__ == '__main__':
  import sys
  main(sys.argv[1], sys.argv[2], sys.argv[3])
