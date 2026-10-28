import { RootState } from "@/lib/store";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";

export type OrganizationState = {
  logoUrl: string | null;
  active: boolean;
  organizationId?: string;
};

const initialState: OrganizationState | null = null;

export const organizationSlice = createSlice({
  name: "organization",
  initialState: initialState as OrganizationState | null,
  reducers: {
    set: (state, action: PayloadAction<OrganizationState>) => {
      return action.payload;
    },
    clear: () => {
      return null;
    },
  },
});

export const { set, clear } = organizationSlice.actions;

export const selectOrganization = (state: RootState) => state.organization;

export default organizationSlice.reducer;
