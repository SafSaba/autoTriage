
import { BrainCircuit } from 'lucide-react';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-bold text-2xl font-headline ${className}`}>
      <BrainCircuit className="h-8 w-8 text-primary" />
      <span className="text-foreground">AI - Safwan Saba</span>
    </div>
  );
}
