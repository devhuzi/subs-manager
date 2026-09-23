import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';

/**
 * The currencies the exchange-rate source (Frankfurter / ECB) publishes, so
 * anything picked here can be converted into the default currency.
 */
export const COMMON_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY', 'CNY', 'INR', 'NZD', 'SGD', 'HKD',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'ISK', 'TRY', 'ILS', 'ZAR',
  'BRL', 'MXN', 'KRW', 'IDR', 'MYR', 'PHP', 'THB',
];

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** ISO currency picker. A stored code outside the common list is kept as an option. */
export const CurrencySelect = ({ id, value, onChange, ...aria }: Props): JSX.Element => {
  const code = value.toUpperCase();
  const options = COMMON_CURRENCIES.includes(code) || !code ? COMMON_CURRENCIES : [code, ...COMMON_CURRENCIES];
  return (
    <Select value={code} onValueChange={onChange}>
      <SelectTrigger id={id} {...aria}>
        <SelectValue placeholder="Currency" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
