import { useForm } from 'react-hook-form';

type PaymentValues = { cardholder: string; cardNumber: string; expiry: string };

export function PaymentForm({ onSubmit }: { onSubmit: (values: PaymentValues) => void }) {
  const { register, handleSubmit, formState } = useForm<PaymentValues>();
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <label>
        Cardholder name
        <input {...register('cardholder', { required: true })} />
      </label>
      <label>
        Card number
        <input inputMode="numeric" {...register('cardNumber', { required: true })} />
      </label>
      <label>
        Expiry
        <input placeholder="MM/YY" {...register('expiry', { required: true })} />
      </label>
      <button type="submit" disabled={formState.isSubmitting}>
        Pay
      </button>
    </form>
  );
}
