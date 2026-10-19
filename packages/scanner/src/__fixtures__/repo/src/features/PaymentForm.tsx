import React from 'react';
import { reduxForm } from 'redux-form';
import type { FormProps } from 'redux-form/lib/types';

export function PaymentForm(props: FormProps) {
  return <form>{props.children}</form>;
}

export default reduxForm({ form: 'payment' })(PaymentForm);
