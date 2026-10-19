import { createFieldArray } from 'redux-form-extra';
import Field from 'redux-form/lib/Field';
import { reduxForm } from 'redux-form';

const AddressLines = createFieldArray('lines');

function AddressForm() {
  return (
    <form>
      <Field name="street" component="input" placeholder="Street" />
      <Field name="city" component="input" placeholder="City" />
      <AddressLines />
    </form>
  );
}

export default reduxForm({ form: 'legacyAddress' })(AddressForm);
