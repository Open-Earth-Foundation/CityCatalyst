import { RootState } from "@/lib/store";
import { UserFileAttributes } from "@/models/UserFile";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";

type InventoryUserFileAttributes = Omit<UserFileAttributes, "id">;

interface SectorFileData {
  sectorName: string;
  files: InventoryUserFileAttributes[];
}

interface inventoryDataState {
  sectors: SectorFileData[];
}

const initialState: inventoryDataState = {
  sectors: [],
};

export const inventoryDataSlice = createSlice({
  name: "inventoryData",
  // state type is inferred from the initial state
  initialState,
  reducers: {
    append: (
      state,
      action: PayloadAction<{
        sectorName: string;
        fileData: InventoryUserFileAttributes;
      }>,
    ) => {
      const { sectorName, fileData } = action.payload;
      const sectorIndex = state.sectors.findIndex(
        (sector) => sector.sectorName === sectorName,
      );
      if (sectorIndex >= 0) {
        // Sector exists, append fileData to this sector
        state.sectors[sectorIndex].files.push(fileData);
      } else {
        // Sector does not exist, create a new sector entry
        state.sectors.push({ sectorName, files: [fileData] });
      }
    },
    removeSectorData: (
      state,
      action: PayloadAction<{
        sectorName: string;
      }>,
    ) => {
      const sectorNameToRemove = action.payload.sectorName;
      state.sectors = state.sectors.filter(
        (sector) => sector.sectorName !== sectorNameToRemove,
      );
    },
    clear: (state) => {
      state.sectors = [];
    },
  },
});

export const { clear, append, removeSectorData } = inventoryDataSlice.actions;

export const selectInventoryData = (state: RootState) => state.inventoryData;

export default inventoryDataSlice.reducer;
