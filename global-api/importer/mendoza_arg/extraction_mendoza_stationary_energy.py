import requests
import argparse
import os

links_to_download={
    'Capital': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1964',
    'General_Alvear': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1946',
    'Gral San Martin': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1959',
    'Godoy_Cruz': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1947',
    'Guaymallen': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1948',
    'Junin': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1949',
    'La_Paz': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1950',
    'Las_Heras': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1951',
    'Lavalle': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1952',
    'Lujan de Cuyo': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1953',
    'Maipu': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1954',
    'Malargue': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1955',
    'Rivadavia': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1956',
    'San_Carlos': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1957',
    'San_Rafael': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1960',
    'Santa_Rosa': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1961',
    'Tunuyan': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1962',
    'Tupungato': 'https://deie.mendoza.gov.ar/data/download-files/?ids=1963',
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Save files in the specified location.')
    parser.add_argument("--filepath", help="path to save the files", required=True)
    args = parser.parse_args()

    absolute_path = os.path.abspath(args.filepath)

    def download_files(links, download_path):
        full_download_path = os.path.expanduser(download_path)
        os.makedirs(full_download_path, exist_ok=True)

        for city, link in links.items():
            try:
                response = requests.get(link)
                # Check if the request was successful (status code 200)
                if response.status_code == 200:
                    file_name = f"{city}_datos_economicos_2022.xlsx"
                    # Construct the complete file path
                    file_path = os.path.join(full_download_path, file_name)
                    # Save the file
                    with open(file_path, 'wb') as file:
                        file.write(response.content)
                    print(f"Downloaded: {file_name}")
                else:
                    print(f"Failed to download {city} data (Status code: {response.status_code})")
            except Exception as e:
                print(f"Error downloading {city} data: {e}")

    # Use the specified download_path
    download_files(links_to_download, download_path=f"{absolute_path}")

