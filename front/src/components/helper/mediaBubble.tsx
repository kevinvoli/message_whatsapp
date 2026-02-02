export const MediaBubble: React.FC<{
  fromMe: boolean;
  children: React.ReactNode;
}> = ({ fromMe, children }) => (
  <div
    className={`rounded-xl overflow-hidden border ${
      fromMe
        ? 'bg-green-700/20 border-green-600/30'
        : 'bg-gray-100 border-gray-200'
    }`}
  >
    {children}
  </div>
);
