import React from "react";
import ReactDOM from "react-dom";
// import { render } from "react-dom";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.min.css";

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);
// render(<App />, document.getElementById("root"));
reportWebVitals();
