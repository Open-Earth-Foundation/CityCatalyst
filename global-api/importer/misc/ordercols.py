from csv import DictReader, DictWriter
import sys
import csv

csv.field_size_limit(sys.maxsize)

def main(first, others):
  merged = {}
  fieldnames = None
  with open(first, 'r') as f:
    reader = DictReader(f)
    fieldnames = reader.fieldnames

  for other in others:
    with open(other, 'r') as f:
      reader = DictReader(f)
      with open(other + '.reordered', 'w') as g:
        writer = DictWriter(g, fieldnames=fieldnames)
        writer.writeheader()
        for row in reader:
          writer.writerow(row)

if __name__ == '__main__':
  import sys
  main(sys.argv[1], sys.argv[2:])
