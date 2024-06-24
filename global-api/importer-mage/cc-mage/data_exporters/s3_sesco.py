@data_loader
def load_data_from_url_and_upload_to_s3(url: str, bucket_name: str, object_key: str, **kwargs) -> None:
    """
    Load data from a URL and upload it to an S3 bucket.
    """
    response = requests.get(url)
    response.raise_for_status()

    with open('extracted_sesco_activity_region', 'wb') as f:
        f.write(response.content)

    config_path = path.join(get_repo_path(), 'io_config.yaml')
    config_profile = 'default'

    bucket_name = 
    object_key = 
    
    s3 = S3.with_config(ConfigFileLoader(config_path, config_profile))
    s3.export('local/argentina/sesco/extracted_sesco_activity_region', bucket_name, object_key)

    print(f"File uploaded to S3 bucket {bucket_name} with key {object_key}")
