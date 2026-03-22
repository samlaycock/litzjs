"use client";

import * as React from "react";

export function ClientCounter(props: { label: string }): React.ReactElement {
  const [count, setCount] = React.useState(0);

  return (
    <button onClick={() => setCount((value) => value + 1)} type="button">
      {props.label}: {count}
    </button>
  );
}
