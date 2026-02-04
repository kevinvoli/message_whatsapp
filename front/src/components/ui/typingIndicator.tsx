export const TypingIndicator = () => {
  return (
    <div className="flex items-center gap-1 text-xs text-green-600">
      <span>écriture</span>
      <span className="typing-dots">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </div>
  );
};