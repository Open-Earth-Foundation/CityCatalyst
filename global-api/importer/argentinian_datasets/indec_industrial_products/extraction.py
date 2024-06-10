import requests
import os

link = 'https://www.indec.gob.ar/ftp/cuadros/economia/cuadros_epi_03_23.xls'

def download_files(links, download_path):
    full_download_path = os.path.expanduser(download_path)
    os.makedirs(full_download_path, exist_ok=True)

    try:
        response = requests.get(link)
        # Check if the request was successful (status code 200)
        if response.status_code == 200:
            file_name = f"raw_GHG_Factors_for_International_Grid_Electricity.xlsx"
            # Construct the complete file path
            file_path = os.path.join(full_download_path, file_name)
            # Save the file
            with open(file_path, 'wb') as file:
                file.write(response.content)
            print(f"Downloaded: {file_name}")s
        else:
            print(f"Failed to download {link} (Status code: {response.status_code})")
    except Exception as e:
        print(f"Error downloading {link} data: {e}")

# Use the specified download_path
download_files(link, download_path='./')


