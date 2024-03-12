import requests
import argparse
import os

links_to_download={
    '2018':'http://www.energia.gob.ar/contenidos/archivos/Reorganizacion/informacion_del_mercado/publicaciones/energia_en_gral/balances_2018/balance_2018_horizontal.xlsx',
    '2019':'http://www.energia.gob.ar/contenidos/archivos/Reorganizacion/informacion_del_mercado/publicaciones/energia_en_gral/balances_energeticos/balance_2019_v0_horizontal.xlsx',
    '2020':'http://www.energia.gob.ar/contenidos/archivos/Reorganizacion/informacion_del_mercado/publicaciones/energia_en_gral/balances_2020/balance_2020_V0_horizontal.xlsx',
    '2021':'http://www.energia.gob.ar/contenidos/archivos/Reorganizacion/informacion_del_mercado/publicaciones/energia_en_gral/balances_2021/balance_2021_V1.xlsx',
    '2022':'http://www.energia.gob.ar/contenidos/archivos/Reorganizacion/informacion_del_mercado/publicaciones/energia_en_gral/balances_2022/Balance_2022_V0_H.xlsx'
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Save files in the specified location.')
    parser.add_argument("--filepath", help="path to save the files", required=True)
    args = parser.parse_args()

    absolute_path = os.path.abspath(args.filepath)

    def download_files(links, download_path):
        full_download_path = os.path.expanduser(download_path)
        os.makedirs(full_download_path, exist_ok=True)

        for year, link in links.items():
            try:
                response = requests.get(link)
                # Check if the request was successful (status code 200)
                if response.status_code == 200:
                    file_name = f"{year}_raw_energy_balances_AR.csv"
                    # Construct the complete file path
                    file_path = os.path.join(full_download_path, file_name)
                    # Save the file
                    with open(file_path, 'wb') as file:
                        file.write(response.content)
                    print(f"Downloaded: {file_name}")
                else:
                    print(f"Failed to download {year} data (Status code: {response.status_code})")
            except Exception as e:
                print(f"Error downloading {year} data: {e}")

    # Use the specified download_path
    download_files(links_to_download, download_path=f"{absolute_path}")
