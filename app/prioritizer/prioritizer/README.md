# toy-prioritizer

Toy prioritizer for climate actions

To set up a Python virtual environment and install the dependencies specified in the `requirements.txt` file, follow these steps:

1. Open a terminal or command prompt.

2. Navigate to the project directory where the `requirements.txt` file is located.

3. Create a new virtual environment by running the following command:

   ```bash
   python -m venv .venv
   ```

   This will create a new directory named `.venv` in your project directory, which will contain the virtual environment.

4. Activate the virtual environment. The command to activate the virtual environment depends on your operating system:

   - On Windows:

     ```bash
     .venv\Scripts\activate
     ```

   - On macOS and Linux:

     ```bash
     source .venv/bin/activate
     ```

   - In VSCode
     Press CTLR + SHIFT + P > Select Interpreter > Select the created venv environment

   Once activated, you should see `(venv)` or a similar indicator in your command prompt.

5. Install the required packages by running the following command:

The script is using Python 3.12.4.

```bash
pip install -r requirements.txt
```

This will install all the packages listed in the `requirements.txt` file into your virtual environment.

# Run the script

Use e.g. this example command

```
python prioritizer.py --city-file cities.csv --action-file actions.csv --output-file output.csv --quantitative --number-of-actions 5
```
