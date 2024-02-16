from csv import DictReader, DictWriter
import sys

seen = set()

with open(sys.argv[1], 'r') as f:
    reader = DictReader(f)
    with open(sys.argv[2], 'w') as out:
        writer = DictWriter(out, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            if row['id'] not in seen:
                seen.add(row['id'])
                writer.writerow(row)
