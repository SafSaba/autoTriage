'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus } from 'lucide-react';

interface QuantitySelectorProps {
  quantity: number;
  onQuantityChange: (newQuantity: number) => void;
  'data-testid'?: string;
}

export function QuantitySelector({ quantity, onQuantityChange, 'data-testid': dataTestId }: QuantitySelectorProps) {
  const handleDecrement = () => {
    onQuantityChange(Math.max(0, quantity - 1));
  };

  const handleIncrement = () => {
    onQuantityChange(quantity + 1);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 0) {
      onQuantityChange(value);
    }
  };

  return (
    <div className="flex items-center gap-2" data-testid={dataTestId}>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleDecrement} aria-label="Decrease quantity">
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        className="w-16 h-8 text-center"
        value={quantity}
        onChange={handleChange}
        min={0}
        aria-label="Quantity"
      />
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleIncrement} aria-label="Increase quantity">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
