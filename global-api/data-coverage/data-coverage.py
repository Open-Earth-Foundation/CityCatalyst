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

  popcache = {}

  def get_population(actor_id, year):
    if actor_id in popcache:
      if year in popcache[actor_id]:
        return popcache[actor_id][year]
    url = f'https://openclimate.openearth.dev/api/v1/actor/{actor_id}'
    response = http.request('GET', url)
    if response.status == 200:
      result = json.loads(response.data.decode('utf-8'))
      population = next(filter(lambda x: x['year'] == year, result['data']['population']), None)
      if population is not None:
        if actor_id not in popcache:
          popcache[actor_id] = {}
        popcache[actor_id][year] = population['population']
        return population['population']
    return None

  def global_api(locode, year, gpc_reference_number, urlFormat):
    url = urlFormat.replace(':locode', locode) \
        .replace(':year', str(year)) \
        .replace(':gpcReferenceNumber', gpc_reference_number)
    response = http.request('GET', url)
    if response.status == 200:
      result = json.loads(response.data.decode('utf-8'))
      total = result['totals']['emissions']['co2eq_100yr']
    else:
      total = None
    return total

  def global_api_downscaled_by_population(locode, year, gpc_reference_number, urlFormat):
    pop_city = get_population(locode, year)
    if pop_city is None:
      return None
    pop_country = get_population(locode[:2], year)
    if pop_city is None:
      return None
    pop_ratio = float(pop_city) / float(pop_country)
    url = urlFormat.replace(':locode', locode) \
        .replace(':year', str(year)) \
        .replace(':gpcReferenceNumber', gpc_reference_number) \
        .replace(':country', locode[:2])
    response = http.request('GET', url)
    if response.status == 200:
      result = json.loads(response.data.decode('utf-8'))
      total = result['totals']['emissions']['co2eq_100yr']
    else:
      total = None
    if total is not None:
      total = int(float(total) * float(pop_city) / float(pop_country))
    return total

  def worker():
      while True:
          (method, locode, year, gpc_reference_number, publisher_id, urlFormat) = q.get()
          if method == 'global_api':
            total = global_api(locode, year, gpc_reference_number, urlFormat)
          elif method == 'global_api_downscaled_by_population':
            total = global_api_downscaled_by_population(locode, year, gpc_reference_number, urlFormat)
          if total is not None:
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
        if datasource['retrieval_method'] in ['global_api', 'global_api_downscaled_by_population']:
          method =  datasource['retrieval_method']
          publisher_id = datasource['publisher_id']
          gpc_reference_number = datasource['gpc_reference_number']
          urlFormat = datasource['api_endpoint']
          for year in range(datasource['start_year'], datasource['end_year'] + 1):
            q.put((method, locode, year, gpc_reference_number, publisher_id, urlFormat))

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
