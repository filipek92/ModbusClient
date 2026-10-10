//! Lenient argument parsing. The frontend may send numbers as strings (e.g. from
//! Quasar inputs), so numeric args mirror JavaScript `parseInt` semantics.

use serde::{Deserialize, Deserializer};
use serde_json::Value;

/// `parseInt`-like conversion: numbers are truncated, strings are parsed from
/// their leading integer part, booleans map to 0/1.
pub fn to_i64(v: &Value) -> Option<i64> {
    match v {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f.trunc() as i64)),
        Value::String(s) => {
            let s = s.trim();
            let end = s
                .char_indices()
                .find(|&(i, c)| !(c.is_ascii_digit() || (i == 0 && (c == '-' || c == '+'))))
                .map_or(s.len(), |(i, _)| i);
            s[..end].parse().ok()
        }
        Value::Bool(b) => Some(i64::from(*b)),
        _ => None,
    }
}

pub fn lenient_int<'de, D, T>(d: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: TryFrom<i64>,
{
    let v = Value::deserialize(d)?;
    let n = to_i64(&v).ok_or_else(|| serde::de::Error::custom(format!("expected integer, got {v}")))?;
    T::try_from(n).map_err(|_| serde::de::Error::custom(format!("integer {n} out of range")))
}

pub fn lenient_int_opt<'de, D, T>(d: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: TryFrom<i64>,
{
    let v = Option::<Value>::deserialize(d)?;
    Ok(v.as_ref().and_then(to_i64).and_then(|n| T::try_from(n).ok()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_int_semantics() {
        assert_eq!(to_i64(&json!(502)), Some(502));
        assert_eq!(to_i64(&json!(12.7)), Some(12));
        assert_eq!(to_i64(&json!("502")), Some(502));
        assert_eq!(to_i64(&json!(" -5 ")), Some(-5));
        assert_eq!(to_i64(&json!("12abc")), Some(12));
        assert_eq!(to_i64(&json!("abc")), None);
        assert_eq!(to_i64(&json!(true)), Some(1));
        assert_eq!(to_i64(&json!(null)), None);
    }
}
