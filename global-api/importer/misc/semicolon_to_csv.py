from csv import DictReader, DictWriter

def main(inputfile, outputfile):
    with open(inputfile, 'r') as f:
        reader = DictReader(f, delimiter=';')
        with open(outputfile, 'w') as f:
          writer = DictWriter(f, delimiter=',', fieldnames=reader.fieldnames)
          writer.writeheader()
          for row in reader:
              writer.writerow(row)

if __name__ == '__main__':
    import sys
    main(sys.argv[1], sys.argv[2])
