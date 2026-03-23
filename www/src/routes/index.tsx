import { defineRoute } from "litzjs";

import { Button } from "../components/button";
import { EnergyVisualization } from "../components/energy-visualization";

export const route = defineRoute("/", {
  component: HomePage,
});

function HomePage() {
  return (
    <>
      <title>Litz</title>
      <div className="flex min-h-[calc(100vh-var(--site-header-height)-48px)]">
        <div className="flex-1 flex flex-col justify-center p-8 border-r border-neutral-800 md:p-12 lg:p-16">
          <div className="max-w-xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-sky-50 mb-6">
              Modern React that puts the <span className="text-sky-500">client first</span>
            </h1>
            <p className="text-lg text-neutral-400 mb-8">
              A client-first React framework with explicit server boundaries, route loaders,
              actions, and reusable resources. Build full-stack apps with the ergonomics of a SPA
              but the power of RSC when you need it.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button as="link" href="/docs">
                Get Started
              </Button>
              <Button
                variant="secondary"
                as="anchor"
                href="https://github.com/samlaycock/litzjs"
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </Button>
            </div>
          </div>
        </div>
        <div className="hidden lg:block lg:w-1/2 min-h-125">
          <EnergyVisualization />
        </div>
      </div>
    </>
  );
}
