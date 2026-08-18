"use client";

import { animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export function Counter({ value, duration = 1.1 }: { value: number; duration?: number }) {
  // Initialise to the real value so it renders correctly on the server and even
  // if client JS never runs. The animation (0 → value) is a progressive bonus.
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 0.7, 0.2, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, duration]);

  return <>{Number(display).toLocaleString("en-IN")}</>;
}
