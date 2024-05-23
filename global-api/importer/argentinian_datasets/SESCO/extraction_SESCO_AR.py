import requests
import argparse
import os

link = 'http://datos.energia.gob.ar/dataset/5bdc436c-60d4-4c86-98ab-59834d047700/resource/f0e4e10a-e4b8-44e6-bd16-763a43742107/download/ventas-excluye-ventas-a-empresas-del-sector-.csv'

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Save files in the specified location.')
    parser.add_argument("--filepath", help="path to save the files", required=True)
    args = parser.parse_args()

    absolute_path = os.path.abspath(args.filepath)

    def download_files(links, download_path):
        full_download_path = os.path.expanduser(download_path)
        os.makedirs(full_download_path, exist_ok=True)

        try:
            response = requests.get(link)
            # Check if the request was successful (status code 200)
            if response.status_code == 200:
                file_name = f"raw_fuel_sales_SESCO_AR.csv"
                # Construct the complete file path
                file_path = os.path.join(full_download_path, file_name)
                # Save the file
                with open(file_path, 'wb') as file:
                    file.write(response.content)
                print(f"Downloaded: {file_name}")
            else:
                print(f"Failed to download {link} (Status code: {response.status_code})")
        except Exception as e:
            print(f"Error downloading {link} data: {e}")

    # Use the specified download_path
    download_files(link, download_path=f"{absolute_path}")
