import dns_cache
import urllib3
import threading
import queue
import json

def main(inputfile, outputfile, concurrency, origin):

  http = urllib3.PoolManager()
  dns_cache.override_system_resolver()

  with open(outputfile, 'w') as file:
    # write text to data
    file.write('locode,gpc_reference_number,publisher_id,year,total\n')

  q = queue.Queue()
  lock = threading.Lock()

  def worker():
      while True:
          (locode, year, gpc_reference_number, publisher_id, urlFormat) = q.get()
          url = urlFormat.replace(':locode', locode) \
              .replace(':year', str(year)) \
              .replace(':gpcReferenceNumber', gpc_reference_number)
          response = http.request('GET', url)
          if response.status == 200:
            result = json.loads(response.data.decode('utf-8'))
            total = result['totals']['emissions']['co2eq_20yr']
            lock.acquire()
            with open(outputfile, 'a') as file:
              # write text to data
              file.write(f'{locode},{gpc_reference_number},{publisher_id},{year},{total}\n')
            lock.release()
          q.task_done()

  # Turn-on the worker thread.
  for _ in range(concurrency):
    threading.Thread(target=worker, daemon=True).start()


  r = http.request('GET', f'{origin}/api/v0/catalogue')
  catalogue = json.loads(r.data.decode('utf-8'))

  with open(inputfile, 'r') as file:
    for line in file:
      locode = line.strip()
      for datasource in catalogue['datasources']:
        if datasource['access_type'] == 'globalapi':
          publisher_id = datasource['publisher_id']
          gpc_reference_number = datasource['gpc_reference_number']
          urlFormat = datasource['api_endpoint']
          for year in range(datasource['start_year'], datasource['end_year'] + 1):
            url = urlFormat.replace(':locode', locode) \
              .replace(':year', str(year)) \
              .replace(':gpcReferenceNumber', gpc_reference_number)
            q.put((locode, year, gpc_reference_number, publisher_id, urlFormat))

  # Block until all tasks are done.
  q.join()
  print('All work completed')

if __name__ == "__main__":
  import argparse
  parser = argparse.ArgumentParser(description='Data coverage')
  parser.add_argument('--outputfile', type=str, default='data-coverage.csv', help='Output file')
  parser.add_argument('--inputfile', type=str, default='locodes.txt', help='Input file')
  parser.add_argument('--concurrency', type=int, default=16, help='Concurrency')
  parser.add_argument('--origin', type=str, default='https://ccglobal.openearth.dev', help='Origin')
  args = parser.parse_args()
  main(args.inputfile, args.outputfile, args.concurrency, args.origin)
