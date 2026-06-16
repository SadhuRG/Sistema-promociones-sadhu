import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";

test("renderiza el sistema de promociones", () => {
  render(<App />);
  expect(screen.getByText(/ROMA SALUD/i)).toBeInTheDocument();
  expect(screen.getByText(/Verificando sesión/i)).toBeInTheDocument();
});
