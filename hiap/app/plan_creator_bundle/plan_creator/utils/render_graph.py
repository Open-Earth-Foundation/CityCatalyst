from PIL import Image
import io


# Utils function to show the graph in seperate window
def render_graph(app):
    image_data = app.get_graph(xray=True).draw_mermaid_png()
    img = Image.open(io.BytesIO(image_data))
    img.show()
