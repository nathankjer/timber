"""
Tests for the timber units module.

This module tests the unit conversion system, formatting, and parsing
for both metric and imperial units.
"""

import sys

import pytest

sys.path.append("src")

from timber.units import UnitConversion, UnitSystemManager, format_acceleration, format_area, format_force, format_length, format_moment, format_moment_of_inertia, format_stress, get_unit_manager, get_unit_system, parse_acceleration, parse_area, parse_force, parse_length, parse_moment, parse_moment_of_inertia, parse_stress, set_unit_system


class TestUnitSystemManager:
    """Test the UnitSystemManager class."""

    def test_metric_system_initialization(self):
        """Test metric system initialization."""
        manager = UnitSystemManager("metric")
        assert manager.system == "metric"

    def test_imperial_system_initialization(self):
        """Test imperial system initialization."""
        manager = UnitSystemManager("imperial")
        assert manager.system == "imperial"

    def test_get_conversion_metric(self):
        """Test getting conversion factors for metric units."""
        manager = UnitSystemManager("metric")
        conv = manager.get_conversion("length", "m")
        assert conv.factor == 1.0
        assert conv.symbol == "m"

        conv = manager.get_conversion("length", "mm")
        assert conv.factor == 0.001
        assert conv.symbol == "mm"

    def test_get_conversion_imperial(self):
        """Test getting conversion factors for imperial units."""
        manager = UnitSystemManager("imperial")
        conv = manager.get_conversion("length", "ft")
        assert conv.factor == 0.3048
        assert conv.symbol == "ft"

        conv = manager.get_conversion("length", "in")
        assert conv.factor == 0.0254
        assert conv.symbol == "in"

    def test_get_preferred_units_metric(self):
        """Test getting preferred units for metric system."""
        manager = UnitSystemManager("metric")
        assert manager.get_preferred_unit("length") == "m"
        assert manager.get_preferred_unit("force") == "kN"
        assert manager.get_preferred_unit("moment") == "kN·m"
        assert manager.get_preferred_unit("stress") == "GPa"
        assert manager.get_preferred_unit("area") == "mm²"
        assert manager.get_preferred_unit("moment_of_inertia") == "mm⁴"
        assert manager.get_preferred_unit("acceleration") == "m/s²"

    def test_get_preferred_units_imperial(self):
        """Test getting preferred units for imperial system."""
        manager = UnitSystemManager("imperial")
        assert manager.get_preferred_unit("length") == "ft"
        assert manager.get_preferred_unit("force") == "lb"
        assert manager.get_preferred_unit("moment") == "lb·ft"
        assert manager.get_preferred_unit("stress") == "ksi"
        assert manager.get_preferred_unit("area") == "in²"
        assert manager.get_preferred_unit("moment_of_inertia") == "in⁴"
        assert manager.get_preferred_unit("acceleration") == "ft/s²"

    def test_convert_to_display_metric(self):
        """Test converting values to display units in metric system."""
        manager = UnitSystemManager("metric")

        # Test length conversion (1 m = 1 m)
        value, unit = manager.convert_to_display(1.0, "length")
        assert value == 1.0
        assert unit == "m"

        # Test force conversion (1000 N = 1 kN)
        value, unit = manager.convert_to_display(1000.0, "force")
        assert value == 1.0
        assert unit == "kN"

    def test_convert_to_display_imperial(self):
        """Test converting values to display units in imperial system."""
        manager = UnitSystemManager("imperial")

        # Test length conversion (1 m = 3.28084 ft)
        value, unit = manager.convert_to_display(1.0, "length")
        assert value == pytest.approx(3.28084, rel=1e-4)
        assert unit == "ft"

        # Test force conversion (4.44822 N = 1 lb)
        value, unit = manager.convert_to_display(4.44822, "force")
        assert value == pytest.approx(1.0, rel=1e-4)
        assert unit == "lb"

    def test_convert_from_display_metric(self):
        """Test converting values from display units in metric system."""
        manager = UnitSystemManager("metric")

        # Test length conversion (1 m = 1 m)
        value = manager.convert_from_display(1.0, "length")
        assert value == 1.0

        # Test force conversion (1 kN = 1000 N)
        value = manager.convert_from_display(1.0, "force")
        assert value == 1000.0

    def test_convert_from_display_imperial(self):
        """Test converting values from display units in imperial system."""
        manager = UnitSystemManager("imperial")

        # Test length conversion (3.28084 ft = 1 m)
        value = manager.convert_from_display(3.28084, "length")
        assert value == pytest.approx(1.0, rel=1e-4)

        # Test force conversion (1 lb = 4.44822 N)
        value = manager.convert_from_display(1.0, "force")
        assert value == pytest.approx(4.44822, rel=1e-4)

    def test_format_value_metric(self):
        """Test formatting values with units in metric system."""
        manager = UnitSystemManager("metric")

        # Test length formatting
        formatted = manager.format_value(1.0, "length")
        assert formatted == "1.000 m"

        # Test force formatting
        formatted = manager.format_value(1000.0, "force")
        assert formatted == "1.000 kN"

    def test_format_value_imperial(self):
        """Test formatting values with units in imperial system."""
        manager = UnitSystemManager("imperial")

        # Test length formatting
        formatted = manager.format_value(1.0, "length")
        assert formatted == "3.281 ft"

        # Test force formatting
        formatted = manager.format_value(4.44822, "force")
        assert formatted == "1.000 lb"

    def test_parse_value_with_units(self):
        """Test parsing values with units."""
        manager = UnitSystemManager("metric")

        # Test parsing with explicit units
        value = manager.parse_value("1 m", "length")
        assert value == 1.0

        value = manager.parse_value("1 kN", "force")
        assert value == 1000.0

    def test_parse_value_without_units(self):
        """Test parsing values without units (assumes preferred unit)."""
        manager = UnitSystemManager("metric")

        # Test parsing without units (assumes m for length)
        value = manager.parse_value("1", "length")
        assert value == 1.0

        # Test parsing without units (assumes kN for force)
        value = manager.parse_value("1", "force")
        assert value == 1000.0

    def test_parse_value_invalid_format(self):
        """Test parsing invalid value formats."""
        manager = UnitSystemManager("metric")

        with pytest.raises(ValueError):
            manager.parse_value("invalid", "length")

        with pytest.raises(ValueError):
            manager.parse_value("", "length")


class TestGlobalUnitFunctions:
    """Test global unit functions."""

    def setup_method(self):
        """Reset unit system to metric before each test."""
        set_unit_system("metric")

    def test_set_and_get_unit_system(self):
        """Test setting and getting unit system."""
        set_unit_system("imperial")
        assert get_unit_system() == "imperial"

        set_unit_system("metric")
        assert get_unit_system() == "metric"

    def test_get_unit_manager(self):
        """Test getting unit manager."""
        manager = get_unit_manager()
        assert isinstance(manager, UnitSystemManager)

    def test_format_length_metric(self):
        """Test length formatting in metric system."""
        set_unit_system("metric")
        assert format_length(1.0) == "1.000 m"

    def test_format_length_imperial(self):
        """Test length formatting in imperial system."""
        set_unit_system("imperial")
        assert format_length(1.0) == "3.281 ft"

    def test_format_force_metric(self):
        """Test force formatting in metric system."""
        set_unit_system("metric")
        assert format_force(1000.0) == "1.000 kN"

    def test_format_force_imperial(self):
        """Test force formatting in imperial system."""
        set_unit_system("imperial")
        assert format_force(4.44822) == "1.000 lb"

    def test_format_moment_metric(self):
        """Test moment formatting in metric system."""
        set_unit_system("metric")
        assert format_moment(1000.0) == "1.000 kN·m"

    def test_format_moment_imperial(self):
        """Test moment formatting in imperial system."""
        set_unit_system("imperial")
        assert format_moment(1.35582) == "1.000 lb·ft"

    def test_format_stress_metric(self):
        """Test stress formatting in metric system."""
        set_unit_system("metric")
        assert format_stress(1e9) == "1.000 GPa"

    def test_format_stress_imperial(self):
        """Test stress formatting in imperial system."""
        set_unit_system("imperial")
        assert format_stress(6894760.0) == "1.000 ksi"

    def test_format_area_metric(self):
        """Test area formatting in metric system."""
        set_unit_system("metric")
        assert format_area(1e-6) == "1.000 mm²"

    def test_format_area_imperial(self):
        """Test area formatting in imperial system."""
        set_unit_system("imperial")
        assert format_area(6.4516e-4) == "1.0000 in²"

    def test_format_moment_of_inertia_metric(self):
        """Test moment of inertia formatting in metric system."""
        set_unit_system("metric")
        assert format_moment_of_inertia(1e-12) == "1.000 mm⁴"

    def test_format_moment_of_inertia_imperial(self):
        """Test moment of inertia formatting in imperial system."""
        set_unit_system("imperial")
        assert format_moment_of_inertia(4.1623e-7) == "1.000000 in⁴"

    def test_format_acceleration_metric(self):
        """Test acceleration formatting in metric system."""
        set_unit_system("metric")
        assert format_acceleration(1.0) == "1.00 m/s²"

    def test_format_acceleration_imperial(self):
        """Test acceleration formatting in imperial system."""
        set_unit_system("imperial")
        assert format_acceleration(0.3048) == "1.00 ft/s²"

    def test_parse_length_metric(self):
        """Test length parsing in metric system."""
        set_unit_system("metric")
        assert parse_length("1 m") == 1.0
        assert parse_length("1000 mm") == 1.0
        assert parse_length("1") == 1.0  # assumes m

    def test_parse_length_imperial(self):
        """Test length parsing in imperial system."""
        set_unit_system("imperial")
        assert parse_length("3.28084 ft") == pytest.approx(1.0, rel=1e-4)
        assert parse_length("12 in") == pytest.approx(0.3048, rel=1e-4)
        assert parse_length("3.28084") == pytest.approx(1.0, rel=1e-4)  # assumes ft

    def test_parse_force_metric(self):
        """Test force parsing in metric system."""
        set_unit_system("metric")
        assert parse_force("1000 N") == 1000.0
        assert parse_force("1 kN") == 1000.0
        assert parse_force("1") == 1000.0  # assumes kN

    def test_parse_force_imperial(self):
        """Test force parsing in imperial system."""
        set_unit_system("imperial")
        assert parse_force("1 lb") == pytest.approx(4.44822, rel=1e-4)
        assert parse_force("1 kip") == pytest.approx(4448.22, rel=1e-4)
        assert parse_force("1") == pytest.approx(4.44822, rel=1e-4)  # assumes lb

    def test_parse_moment_metric(self):
        """Test moment parsing in metric system."""
        set_unit_system("metric")
        assert parse_moment("1000 N·m") == 1000.0
        assert parse_moment("1 kN·m") == 1000.0
        assert parse_moment("1") == 1000.0  # assumes kN·m

    def test_parse_moment_imperial(self):
        """Test moment parsing in imperial system."""
        set_unit_system("imperial")
        assert parse_moment("1 lb·ft") == pytest.approx(1.35582, rel=1e-4)
        assert parse_moment("1 kip·ft") == pytest.approx(1355.82, rel=1e-4)
        assert parse_moment("1") == pytest.approx(1.35582, rel=1e-4)  # assumes lb·ft

    def test_parse_stress_metric(self):
        """Test stress parsing in metric system."""
        set_unit_system("metric")
        assert parse_stress("1e9 Pa") == 1e9
        assert parse_stress("1 GPa") == 1e9
        assert parse_stress("1") == 1e9  # assumes GPa

    def test_parse_stress_imperial(self):
        """Test stress parsing in imperial system."""
        set_unit_system("imperial")
        assert parse_stress("1 psi") == pytest.approx(6894.76, rel=1e-4)
        assert parse_stress("1 ksi") == pytest.approx(6894760.0, rel=1e-4)
        assert parse_stress("1") == pytest.approx(6894760.0, rel=1e-4)  # assumes ksi

    def test_parse_area_metric(self):
        """Test area parsing in metric system."""
        set_unit_system("metric")
        assert parse_area("1e-6 m²") == 1e-6
        assert parse_area("1 mm²") == 1e-6
        assert parse_area("1") == 1e-6  # assumes mm²

    def test_parse_area_imperial(self):
        """Test area parsing in imperial system."""
        set_unit_system("imperial")
        assert parse_area("1 ft²") == pytest.approx(0.092903, rel=1e-4)
        assert parse_area("1 in²") == pytest.approx(6.4516e-4, rel=1e-4)
        assert parse_area("1") == pytest.approx(6.4516e-4, rel=1e-4)  # assumes in²

    def test_parse_moment_of_inertia_metric(self):
        """Test moment of inertia parsing in metric system."""
        set_unit_system("metric")
        assert parse_moment_of_inertia("1e-12 m⁴") == 1e-12
        assert parse_moment_of_inertia("1 mm⁴") == 1e-12
        assert parse_moment_of_inertia("1") == 1e-12  # assumes mm⁴

    def test_parse_moment_of_inertia_imperial(self):
        """Test moment of inertia parsing in imperial system."""
        set_unit_system("imperial")
        assert parse_moment_of_inertia("1 in⁴") == pytest.approx(4.1623e-7, rel=1e-4)
        assert parse_moment_of_inertia("1") == pytest.approx(4.1623e-7, rel=1e-4)  # assumes in⁴

    def test_parse_acceleration_metric(self):
        """Test acceleration parsing in metric system."""
        set_unit_system("metric")
        assert parse_acceleration("1 m/s²") == 1.0
        assert parse_acceleration("1") == 1.0  # assumes m/s²

    def test_parse_acceleration_imperial(self):
        """Test acceleration parsing in imperial system."""
        set_unit_system("imperial")
        assert parse_acceleration("1 ft/s²") == pytest.approx(0.3048, rel=1e-4)
        assert parse_acceleration("1") == pytest.approx(0.3048, rel=1e-4)  # assumes ft/s²


class TestUnitConstants:
    """Test unit constant definitions."""

    def test_length_units(self):
        """Test length unit definitions."""
        from timber.units import UNIT_VECTORS

        assert "m" in UNIT_VECTORS
        assert "mm" in UNIT_VECTORS
        assert "ft" in UNIT_VECTORS
        assert "in" in UNIT_VECTORS

    def test_force_units(self):
        """Test force unit definitions."""
        from timber.units import UNIT_VECTORS

        assert "N" in UNIT_VECTORS
        assert "kN" in UNIT_VECTORS
        assert "lb" in UNIT_VECTORS

    def test_moment_units(self):
        """Test moment unit definitions."""
        from timber.units import UNIT_VECTORS

        assert "N·m" in UNIT_VECTORS
        assert "kN·m" in UNIT_VECTORS
        assert "lb·ft" in UNIT_VECTORS

    def test_stress_units(self):
        """Test stress unit definitions."""
        from timber.units import UNIT_VECTORS

        assert "Pa" in UNIT_VECTORS
        assert "MPa" in UNIT_VECTORS
        assert "GPa" in UNIT_VECTORS
        assert "psi" in UNIT_VECTORS
        assert "ksi" in UNIT_VECTORS

    def test_area_units(self):
        """Test area unit definitions."""
        from timber.units import UNIT_VECTORS

        assert "m²" in UNIT_VECTORS
        assert "mm²" in UNIT_VECTORS
        assert "ft²" in UNIT_VECTORS
        assert "in²" in UNIT_VECTORS

    def test_moment_of_inertia_units(self):
        """Test moment of inertia unit definitions."""
        from timber.units import UNIT_VECTORS

        assert "m⁴" in UNIT_VECTORS
        assert "mm⁴" in UNIT_VECTORS
        assert "in⁴" in UNIT_VECTORS

    def test_acceleration_units(self):
        """Test acceleration unit definitions."""
        from timber.units import UNIT_VECTORS

        assert "m/s²" in UNIT_VECTORS
        assert "ft/s²" in UNIT_VECTORS


class TestUnitConversion:
    """Test UnitConversion class."""

    def test_unit_conversion_creation(self):
        """Test creating UnitConversion objects."""
        conv = UnitConversion(1.0, "m", 3)
        assert conv.factor == 1.0
        assert conv.symbol == "m"
        assert conv.precision == 3

    def test_unit_conversion_default_precision(self):
        """Test UnitConversion default precision."""
        conv = UnitConversion(1.0, "m")
        assert conv.precision == 3
