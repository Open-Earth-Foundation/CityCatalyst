type SubSector = {
  id: number | string;
  title: string;
  scopes: number[];
  isAdded: boolean;
};

type DataSource = {
  id: number | string;
  icon: any;
  title: string;
  dataQuality: "low" | "medium" | "high";
  scopes: number[];
  description: string;
  url: string;
  isConnected: boolean;
};
