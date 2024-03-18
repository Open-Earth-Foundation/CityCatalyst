import { RootState } from "@/lib/store";
import { UserFileAttributes } from "@/models/UserFile";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface FileData {
  subsectors: string;
  scopes: string;
}

const initialState: FileData = {
  subsectors: "",
  scopes: "",
};

export const fileDataSlice = createSlice({
  name: "fileData",
  initialState,
  reducers: {
    addFileData: (
      state,
      action: PayloadAction<{ subsectors: string; scopes: string }>,
    ) => {
      const { subsectors, scopes } = action.payload;
      state.scopes = scopes;
      state.subsectors = subsectors;
    },
    clear: (state) => {
      state.scopes = "";
      state.subsectors = "";
    },
  },
});

export const { addFileData, clear } = fileDataSlice.actions;
export const selectFileData = (state: RootState) => state.fileData;
export default fileDataSlice.reducer;
