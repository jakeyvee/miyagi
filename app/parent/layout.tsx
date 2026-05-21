export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <section data-surface="parent">{children}</section>;
}
