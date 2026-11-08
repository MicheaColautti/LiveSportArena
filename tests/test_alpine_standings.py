import unittest

from backend.alpine_standings import parse_standings


def filters():
    values = dict(seasoncode='2027', cupcode='WC', gendercode='W', disciplinecode='ALL')
    return ''.join(f'<select name="{k}"><option value="{v}" selected>{v}</option></select>' for k, v in values.items())


def details(rank, points):
    return ('<div class="g-xs-24"><div>Overall</div><div>ALL</div><div>&nbsp;</div>'
            f'<div>{rank}</div><div>&nbsp;</div><div>{points}</div></div>')


def cells(name, country, rank, points):
    return (f'<div class="container g-row"><div>{name}</div><div></div>'
            f'<div><span class="country__name-short">{country}</span></div><div>{details(rank, points)}</div></div>')


def plain_row(athlete, name, country, rank, points):
    url = f'https://www.fis-ski.com/athlete.html?competitorid={athlete}'
    return f'<a class="table-row" href="{url}">{cells(name, country, rank, points)}</a>'


def badge_row(athlete, name, country, rank, points):
    url = f'https://www.fis-ski.com/athlete.html?competitorid={athlete}'
    title = f'<a href="{url}">{name}</a> <a href="https://www.fis-ski.com/rising-stars.html"><img alt="leader"></a>'
    return f'<div class="table-row reset-padding">{cells(title, country, rank, points)}</div>'


def page(*rows):
    return f'{filters()}<div class="table__body">{"".join(rows)}</div>'


class StandingsParserTest(unittest.TestCase):
    def test_row_with_badge_link_is_kept_in_rank_order(self):
        html = page(plain_row('1', 'MOLTZAN Paula', 'USA', 1, 100), badge_row('2', 'COLTURI Lara', 'ALB', 2, 80),
                    plain_row('3', 'AICHER Emma', 'GER', 3, 60))
        rows = parse_standings(html, 2027, 'W', {})['ALL']
        self.assertEqual([(r['rank'], r['name'], r['country'], r['points']) for r in rows],
                         [(1, 'MOLTZAN Paula', 'USA', 100), (2, 'COLTURI Lara', 'ALB', 80), (3, 'AICHER Emma', 'GER', 60)])

    def test_badge_row_uses_the_athlete_link(self):
        rows = parse_standings(page(badge_row('269077', 'COLTURI Lara', 'ALB', 2, 80)), 2027, 'W', {})['ALL']
        self.assertEqual(rows[0]['competitorId'], '269077')
        self.assertIn('competitorid=269077', rows[0]['athleteUrl'])

    def test_undecodable_rows_still_raise(self):
        with self.assertRaises(ValueError):
            parse_standings(page('<div class="table-row"><a href="https://www.fis-ski.com/other.html">x</a></div>'), 2027, 'W', {})


if __name__ == '__main__':
    unittest.main()
