import { useState } from "react";
import { Marker, Overlay } from "pigeon-maps";

export function PopupMarker({
  popupText,
  anchor,
  onClick,
}: {
  popupText: string;
  anchor: [number, number];
  onClick: any;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <Marker
        width={50}
        color="#648bff"
        anchor={anchor}
        onClick={onClick}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      />

      {hovered && (
        <Overlay anchor={anchor}>
          <div
            style={{
              position: "absolute",
              transform: "translate(-50%, -100%)",
              backgroundColor: "white",
              border: "1px solid black",
              padding: "5px",
              borderRadius: "5px",
              zIndex: 1000, // Ensures the popup is above other map elements
              pointerEvents: "none", // Prevents the popup from blocking interactions with the map
            }}
          >
            {popupText}
          </div>
        </Overlay>
      )}
    </>
  );
}
