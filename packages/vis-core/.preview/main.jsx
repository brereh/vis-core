import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { DateRangeSelector } from "Components/Sidebar/Selectors/DateRangeSelector";
import { brandThemeDefaults } from "defaults";
const filter = { id: "d", filterName: "Survey dates", type: "dateRange", paramName: ["date_from","date_to"], min: "2025-10-06", max: "2025-10-19", locale: "en-GB" };
const App = () => { const [v, setV] = useState(["2025-10-06","2025-10-19"]);
  return <ThemeProvider theme={brandThemeDefaults}><DateRangeSelector filter={filter} value={v} onChange={(f, n) => setV(n)} /><pre id="out">{JSON.stringify(v)}</pre></ThemeProvider>; };
createRoot(document.getElementById("root")).render(<App />);
