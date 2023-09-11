import os


def get_or_create_log_file(file_path):
    # check if the file already exists
    if os.path.exists(file_path):
        return file_path

    # create the "logs" directory if it doesn't exist
    logs_directory = "logs"
    if not os.path.exists(logs_directory):
        os.makedirs(logs_directory)

    # Create the "api-log" file in the "logs" directory
    new_file_path = os.path.join(logs_directory, "api-log")
    with open(new_file_path, "w") as f:
        pass  # Creates an empty file

    return new_file_path
