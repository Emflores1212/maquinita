CREATE UNIQUE INDEX IF NOT EXISTS alerts_low_stock_unique_active
ON alerts (operator_id, machine_id, type, message)
WHERE type = 'LOW_STOCK' AND resolved_at IS NULL;

CREATE OR REPLACE FUNCTION evaluate_low_stock_for_combo(
  p_operator_id UUID,
  p_machine_id UUID,
  p_product_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_par_quantity INT;
  v_current_count INT;
  v_message TEXT;
BEGIN
  IF p_operator_id IS NULL OR p_machine_id IS NULL OR p_product_id IS NULL THEN
    RETURN;
  END IF;

  SELECT quantity
  INTO v_par_quantity
  FROM par_levels
  WHERE machine_id = p_machine_id
    AND product_id = p_product_id;

  IF v_par_quantity IS NULL OR v_par_quantity <= 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_current_count
  FROM rfid_items
  WHERE operator_id = p_operator_id
    AND machine_id = p_machine_id
    AND product_id = p_product_id
    AND status = 'in_machine';

  v_message := 'LOW_STOCK|product=' || p_product_id::text || '|current=' || v_current_count::text || '|par=' || v_par_quantity::text;

  IF v_current_count < v_par_quantity THEN
    INSERT INTO alerts (operator_id, machine_id, type, severity, message)
    VALUES (p_operator_id, p_machine_id, 'LOW_STOCK', 'warning', v_message)
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE alerts
    SET resolved_at = NOW()
    WHERE operator_id = p_operator_id
      AND machine_id = p_machine_id
      AND type = 'LOW_STOCK'
      AND resolved_at IS NULL
      AND message LIKE 'LOW_STOCK|product=' || p_product_id::text || '|%';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION handle_rfid_par_level_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM evaluate_low_stock_for_combo(NEW.operator_id, NEW.machine_id, NEW.product_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM evaluate_low_stock_for_combo(OLD.operator_id, OLD.machine_id, OLD.product_id);
    PERFORM evaluate_low_stock_for_combo(NEW.operator_id, NEW.machine_id, NEW.product_id);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rfid_par_level_alerts_trigger ON rfid_items;

CREATE TRIGGER rfid_par_level_alerts_trigger
AFTER INSERT OR UPDATE ON rfid_items
FOR EACH ROW
EXECUTE FUNCTION handle_rfid_par_level_alerts();
