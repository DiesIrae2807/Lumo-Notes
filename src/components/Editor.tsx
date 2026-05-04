const goals = [
  "Delightful and minimal experience",
  "Powerful linking and knowledge capture",
  "Clear structure across devices",
  "Private, focused, and reliable",
];

const roadmap = [
  { label: "Define MVP scope", checked: true },
  { label: "User research", checked: true },
  { label: "Wireframes and prototype", checked: false },
  { label: "Build core linking experience", checked: false },
  { label: "Beta release", checked: false },
];

export function Editor() {
  return (
    <main className="column-panel editor-glow flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-2 w-2 rounded-full bg-lumo-blue" />
          <span>Work</span>
          <span>/</span>
          <span className="font-medium text-lumo-violet">Project Aurora</span>
          <span className="ml-2 text-amber-300">★</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button className="rounded-lg px-3 py-1.5 transition hover:bg-white/[0.05] hover:text-slate-300 active:scale-95">
            Saved
          </button>
          <button className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white/[0.05] hover:text-white active:scale-95">
            +
          </button>
        </div>
      </div>

      <article className="scroll-area flex-1 overflow-y-auto px-6 py-7 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-7">
            <div className="mb-4 grid h-7 w-7 place-items-center text-xl text-lumo-violet">
              ✧
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Project Aurora
            </h2>
            <p className="mt-3 text-base text-slate-300">
              Product vision, goals, and roadmap
            </p>
          </div>

          <section className="editor-section">
            <h3>Vision</h3>
            <p>
              Create a calm, intelligent note-taking experience that helps people
              think clearly and stay connected.
            </p>
          </section>

          <section className="editor-section">
            <h3>Goals</h3>
            <ul className="space-y-2">
              {goals.map((goal) => (
                <li key={goal} className="flex gap-3 text-slate-300">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-lumo-teal" />
                  <span>{goal}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="editor-section">
            <h3>Roadmap</h3>
            <div className="space-y-3">
              {roadmap.map((item) => (
                <label key={item.label} className="flex items-center gap-3 text-slate-300">
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-md border ${
                      item.checked
                        ? "border-lumo-teal bg-lumo-teal text-night-950"
                        : "border-slate-600 bg-white/[0.03]"
                    }`}
                  >
                    {item.checked ? <span className="h-1.5 w-2.5 rotate-[-45deg] border-b-2 border-l-2 border-night-950" /> : null}
                  </span>
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </section>

          <div className="aurora-card mt-7 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            <div className="aurora-landscape h-44 md:h-52" />
          </div>
        </div>
      </article>

      <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 text-slate-400">
        <div className="flex items-center gap-1">
          {["B", "I", "U", "List", "Bullets", "Link", "Code", "Image", "Grid"].map((tool) => (
            <button
              key={tool}
              className="rounded-lg px-3 py-2 text-xs transition hover:bg-white/[0.05] hover:text-white active:scale-95"
            >
              {tool}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-300">1,345 words</span>
      </div>
    </main>
  );
}
