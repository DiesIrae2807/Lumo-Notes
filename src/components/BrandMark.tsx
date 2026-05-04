type BrandMarkProps = {
  size?: "sm" | "md";
};

export function BrandMark({ size = "md" }: BrandMarkProps) {
  const dimensions = size === "md" ? "h-10 w-10" : "h-6 w-6";

  return (
    <div
      className={`${dimensions} relative grid place-items-center rounded-2xl border border-lumo-violet/30 bg-lumo-violet/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]`}
      aria-hidden="true"
    >
      <span className="absolute h-1/2 w-1/2 rotate-45 rounded-[5px] border border-lumo-violet bg-lumo-violet/10 shadow-[0_0_24px_rgba(156,124,244,0.25)]" />
      <span className="h-1.5 w-1.5 rounded-full bg-lumo-teal" />
    </div>
  );
}
