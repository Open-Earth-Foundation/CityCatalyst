from csv import DictReader, DictWriter
import sys
import csv

csv.field_size_limit(sys.maxsize)

def main(key, input, output):
  data = {}
  fieldnames = None
  with open(input, 'r') as f:
    reader = DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
      data[row[key]] = row

  with open(output, 'w') as f:
    writer = DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for key in sorted(data.keys()):
      writer.writerow(data[key])

if __name__ == '__main__':
  import sys
  main(sys.argv[1], sys.argv[2], sys.argv[3])
